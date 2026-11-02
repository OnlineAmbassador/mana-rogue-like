const gamepadInput = {
  connected: false,
  family: 'xbox',
  moveX: 0,
  moveY: 0,
  dpadX: 0,
  dpadY: 0,
  dpadFacing: false,
  aimX: 1,
  aimY: 0,
  aimActive: false,
  shoot: false,
};
const previousGamepadButtons = new Map();
const previousGamepadAxes = new Map();
let previousMenuDirection = 0;
// Last map-cursor direction held ('1,0', '0,-1', …, or '' when none).
let previousMapStep = '';

function applyGamepadDeadzone(value) {
  const deadzone = 0.22;
  const magnitude = Math.abs(value);
  return magnitude <= deadzone ? 0 : Math.sign(value) * (magnitude - deadzone) / (1 - deadzone);
}

function pollGamepad(dt = 1 / 60) {
  const gamepads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
  const gamepad = Array.from(gamepads).find((candidate) => candidate?.connected &&
    (candidate.mapping === 'standard' || (candidate.axes?.length >= 4 && candidate.buttons?.length >= 10)));
  if (!gamepad) {
    if (gamepadInput.connected) {
      showMessage('Controller disconnected.', 2);
      setInputMode(lastNonControllerInputMode);
    }
    gamepadInput.connected = false;
    gamepadInput.moveX = 0;
    gamepadInput.moveY = 0;
    gamepadInput.dpadX = 0;
    gamepadInput.dpadY = 0;
    gamepadInput.dpadFacing = false;
    gamepadInput.shoot = false;
    gamepadInput.aimActive = false;
    previousGamepadButtons.clear();
    previousGamepadAxes.clear();
    previousMenuDirection = 0;
    return;
  }

  if (!gamepadInput.connected) {
    gamepadInput.family = /054c|dualsense|dualshock|playstation|wireless controller/i.test(gamepad.id) ? 'ps' : 'xbox';
    showMessage('Controller connected. Press any button and the on-screen prompts switch to it.', 4);
  }
  gamepadInput.connected = true;

  const previousButtons = previousGamepadButtons.get(gamepad.index) || [];
  const isButtonDown = (buttonIndex) => Boolean(gamepad.buttons[buttonIndex]?.pressed ||
    gamepad.buttons[buttonIndex]?.value > 0.5);
  const wasButtonPressed = (buttonIndex) => isButtonDown(buttonIndex) && !previousButtons[buttonIndex];
  if (gamepad.buttons.some((button, index) => (button.pressed || button.value > 0.5) && !previousButtons[index])) {
    startGameMusic();
  }
  const horizontalAxis = applyGamepadDeadzone(gamepad.axes[0] || 0);
  const verticalAxis = applyGamepadDeadzone(gamepad.axes[1] || 0);
  const dpadX = mode === 'playing' ? 0 : (isButtonDown(15) ? 1 : 0) - (isButtonDown(14) ? 1 : 0);
  const dpadY = mode === 'playing' ? 0 : (isButtonDown(13) ? 1 : 0) - (isButtonDown(12) ? 1 : 0);
  gamepadInput.dpadX = dpadX;
  gamepadInput.dpadY = dpadY;
  gamepadInput.dpadFacing = dpadX !== 0 || dpadY !== 0;
  gamepadInput.moveX = horizontalAxis || dpadX;
  gamepadInput.moveY = verticalAxis || dpadY;

  const aimX = applyGamepadDeadzone(gamepad.axes[2] || 0);
  const aimY = applyGamepadDeadzone(gamepad.axes[3] || 0);
  const aimLength = Math.hypot(aimX, aimY);
  const aimingWithRightStick = aimLength > 0;
  const controllerButtonPressed = gamepad.buttons.some((button, index) =>
    (button.pressed || button.value > 0.5) && !previousButtons[index]);
  const previousAxes = previousGamepadAxes.get(gamepad.index) || [];
  const controllerAxisMoved = gamepad.axes.some((axis, index) => {
    const value = applyGamepadDeadzone(axis || 0);
    const previousValue = previousAxes[index] || 0;
    return value !== 0 && Math.abs(value - previousValue) > 0.12;
  });
  if (controllerButtonPressed || controllerAxisMoved) {
    setInputMode('controller');
    updateControlsHint();
  }
  gamepadInput.aimActive = aimingWithRightStick;
  const rawShoot = mode === 'playing' && lastInputMode === 'controller' &&
    (isButtonDown(2) || isButtonDown(7) || aimingWithRightStick);
  if (attackInputSuppressed && !rawShoot && !pointer.down && !touchInput.attack) attackInputSuppressed = false;
  gamepadInput.shoot = rawShoot && !attackInputSuppressed;
  if (aimingWithRightStick && !mouseAimActive) {
    gamepadInput.aimX = aimX / aimLength;
    gamepadInput.aimY = aimY / aimLength;
  }
  if (mode === 'playing' && !showStoryJournal && lastInputMode === 'controller') {
    if (aimingWithRightStick) {
      mouseAimActive = false;
      player.lookX = gamepadInput.aimX;
      player.lookY = gamepadInput.aimY;
    }
  }

  const menuDirection = dpadX || (Math.abs(horizontalAxis) > 0.6 ? Math.sign(horizontalAxis) : 0);
  const menuVertical = dpadY || (Math.abs(verticalAxis) > 0.6 ? Math.sign(verticalAxis) : 0);
  if (mode !== pollGamepad.lastMode) {
    audioFocus = mode === 'settings' && AUDIO_FOCUS_ORDER.includes(settingsFocus) ? settingsFocus : null;
    pollGamepad.lastMode = mode;
  }
  if (ttsPromptActive()) {
    if (wasButtonPressed(0) || wasButtonPressed(9)) setTextToSpeech(true);
    else if (wasButtonPressed(1)) setTextToSpeech(false);
    previousMenuDirection = menuDirection;
    previousMenuVertical = menuVertical;
    previousGamepadButtons.set(gamepad.index, gamepad.buttons.map((button) => button.pressed || button.value > 0.5));
    previousGamepadAxes.set(gamepad.index, [...gamepad.axes]);
    return;
  }
  let audioConsumed = false;
  if (mode === 'settings' || mode === 'prologue') {
    if (menuVertical !== 0 && menuVertical !== previousMenuVertical) {
      if (mode === 'settings') moveSettingsFocus(menuVertical);
      else stepAudioFocus(menuVertical);
      audioConsumed = true;
    }
    if (handleAudioPanelPad(menuDirection, wasButtonPressed(0))) audioConsumed = true;
  } else {
    handleAudioPanelPad.previousHorizontal = 0;
  }
  const audioFocused = audioFocus !== null && (mode === 'settings' || mode === 'prologue');
  if (!audioFocused && !audioConsumed) {
    if (mode === 'prologue' && menuDirection !== 0 && menuDirection !== previousMenuDirection) {
      advancePrologue(menuDirection);
    } else if (mode === 'select' && menuDirection !== 0 && menuDirection !== previousMenuDirection) {
      chooseCharacter(menuDirection > 0 ? 'ArrowRight' : 'ArrowLeft');
    } else if (mode === 'tutorial' && menuDirection !== 0 && menuDirection !== previousMenuDirection) {
      stepTutorial(menuDirection);
    } else if (mode === 'paused' && menuDirection !== 0 && menuDirection !== previousMenuDirection) {
      movePauseMenuFocus(menuDirection);
    }
  }
  previousMenuDirection = ['select', 'prologue', 'tutorial', 'paused'].includes(mode) ? menuDirection : 0;
  if (mode === 'select' && menuVertical !== 0 && menuVertical !== previousMenuVertical) moveMenuFocus(menuVertical);
  if (mode === 'paused' && menuVertical !== 0 && menuVertical !== previousMenuVertical) {
    pauseMenuFocus = menuVertical > 0 ? 'settings' : 'resume';
  }
  previousMenuVertical = ['select', 'prologue', 'paused', 'settings'].includes(mode) ? menuVertical : 0;
  // Tracked every frame, so a direction already held when the map opens does not move its cursor.
  const mapX = (isButtonDown(15) ? 1 : 0) - (isButtonDown(14) ? 1 : 0) ||
    (Math.abs(horizontalAxis) > 0.6 ? Math.sign(horizontalAxis) : 0);
  const mapY = (isButtonDown(13) ? 1 : 0) - (isButtonDown(12) ? 1 : 0) ||
    (Math.abs(verticalAxis) > 0.6 ? Math.sign(verticalAxis) : 0);
  const mapStep = mapX !== 0 ? [mapX, 0] : mapY !== 0 ? [0, mapY] : null;
  const mapStepKey = mapStep ? mapStep.join(',') : '';
  const lastMapStep = previousMapStep;
  previousMapStep = mapStepKey;

  if (mode === 'prologue') {
    if (!audioFocused && (wasButtonPressed(0) || wasButtonPressed(9))) advancePrologue(1);
    else if (audioFocused && wasButtonPressed(9)) advancePrologue(1);
    if (wasButtonPressed(1)) {
      if (audioFocused) audioFocus = null;
      else advancePrologue(-1);
    }
  } else if (mode === 'select') {
    if (audioFocused && wasButtonPressed(9)) beginRun();
    else if (!audioFocused && (wasButtonPressed(0) || wasButtonPressed(2) || wasButtonPressed(9))) activateMenuFocus();
    if (wasButtonPressed(5)) openCodex();
    if (wasButtonPressed(3)) openTutorial();
    if (wasButtonPressed(8)) openSettings();
    if (wasButtonPressed(4)) openPrologue();
  } else if (mode === 'tutorial') {
    if (wasButtonPressed(1) || wasButtonPressed(9)) closeTutorial();
    if (wasButtonPressed(0) || wasButtonPressed(5)) stepTutorial(1);
    if (wasButtonPressed(4)) stepTutorial(-1);
  } else if (mode === 'codex') {
    if (wasButtonPressed(0) || wasButtonPressed(1) || wasButtonPressed(9)) closeCodex();
    if (wasButtonPressed(4) || wasButtonPressed(5)) toggleCodexTab();
    if (wasButtonPressed(12) || wasButtonPressed(13)) {
      codexScroll = clamp(codexScroll + (wasButtonPressed(13) ? 1 : -1), 0, Math.max(0, codexEntries().length - 7));
    }
  } else if (mode === 'chapter') {
    if (wasButtonPressed(0) || wasButtonPressed(1) || wasButtonPressed(9)) closeChapter();
  } else if (mode === 'controls') {
    updateControlsPad(wasButtonPressed);
  } else if (mode === 'settings') {
    if (wasButtonPressed(1) || wasButtonPressed(8) || wasButtonPressed(9)) closeSettings();
    else if (!audioFocused && !audioConsumed && wasButtonPressed(0)) activateSettingsEntry();
  } else if (mode === 'paused') {
    if (wasButtonPressed(9)) resumeGame();
    else if (!audioFocused && !audioConsumed && wasButtonPressed(0)) confirmPauseMenuFocus();
    else if (wasButtonPressed(1)) {
      if (audioFocused) audioFocus = null;
      else exitToTitle();
    } else if (wasButtonPressed(8)) openSettings();
  } else if (mode === 'gameover' || mode === 'won') {
    if (wasButtonPressed(0) || wasButtonPressed(9)) returnToCharacterSelect();
  } else if (mode === 'boon') {
    if (mapStep && mapStepKey !== lastMapStep && mapStep[0]) moveBoonFocus(mapStep[0]);
    if (wasButtonPressed(0) || wasButtonPressed(2)) confirmBoonChoice();
  } else if (mode === 'element') {
    if (mapStep && mapStepKey !== lastMapStep) moveElementFocus(mapStep[0], mapStep[1]);
    if (wasButtonPressed(0) || wasButtonPressed(2)) confirmElementChoice();
  } else if (mode === 'ability') {
    if (mapStep && mapStepKey !== lastMapStep) moveAbilityFocus(mapStep[0], mapStep[1]);
    if (wasButtonPressed(0) || wasButtonPressed(2)) confirmAbilityChoice();
    else if (wasButtonPressed(1)) skipAbilityChoice();
  } else if (mode === 'weapon') {
    if (mapStep && mapStepKey !== lastMapStep && mapStep[0]) moveStartingWeaponFocus(mapStep[0]);
    if (wasButtonPressed(0) || wasButtonPressed(2)) confirmStartingWeaponChoice();
  } else if (mode === 'branches') {
    // While the first-visit tour or a guidance spotlight shows, any press moves it on.
    const anyPress = [0, 1, 2, 3, 4, 5, 6, 7, 9].some((button) => wasButtonPressed(button));
    if (wasButtonPressed(1) || wasButtonPressed(9)) {
      closeBranchScreen();
    } else if (branchTourActive()) {
      if (anyPress || (mapStep && mapStepKey !== lastMapStep)) advanceBranchTour();
    } else {
      if (anyPress || aimY !== 0 || (mapStep && mapStepKey !== lastMapStep)) dismissBranchGuide();
      if (aimY !== 0) zoomBranchMap(Math.exp(-aimY * 1.5 * Math.min(dt, 0.1)));
      if (mapStep && mapStepKey !== lastMapStep) moveBranchMapFocus(mapStep[0], mapStep[1]);
      if (wasButtonPressed(4)) stepBranchTab(-1);
      if (wasButtonPressed(5)) stepBranchTab(1);
      if (wasButtonPressed(6)) zoomBranchMap(1 / 1.25);
      if (wasButtonPressed(7)) zoomBranchMap(1.25);
      if (wasButtonPressed(0)) toggleFocusedBranch();
      if (wasButtonPressed(3)) unlockFocusedBranch();
      if (wasButtonPressed(2)) unweaveFocusedNode();
      if (wasButtonPressed(1) || wasButtonPressed(9)) closeBranchScreen();
    }
  } else if (mode === 'playing' && showStoryJournal) {
    if (wasButtonPressed(9)) pauseGame();
    else if (wasButtonPressed(1)) toggleStoryJournal();
    else {
      for (let button = 0; button < 16; button += 1) {
        if (wasButtonPressed(button) && actionForPad(button) === 'journal') {
          toggleStoryJournal();
          break;
        }
      }
    }
  } else if (mode === 'playing' && showMap) {
    // Map-only navigation (an approved exception to the controller lock): gameplay is paused while the map is open.
    if (mapStep && mapStepKey !== lastMapStep) stepMapCursor(...mapStep);
    const mapButton = bindings.pad.map;
    if (wasButtonPressed(9)) pauseGame();
    else if (wasButtonPressed(0)) travelToMapCursor();
    else if (wasButtonPressed(1) || (mapButton !== null && mapButton !== undefined && wasButtonPressed(mapButton))) closeMap();
  } else if (mode === 'playing') {
    if (wasButtonPressed(9)) pauseGame();
    for (let button = 0; button < 16; button += 1) {
      if (!wasButtonPressed(button)) continue;
      const action = actionForPad(button);
      if (!action) continue;
      if (action === 'bomb' && hasVault(currentRoom) &&
          distanceBetween(player, { x: ROOM_W / 2, y: ROOM_H / 2 }) < 240) interact(true);
      else runAction(action);
    }
  }

  previousGamepadButtons.set(gamepad.index, gamepad.buttons.map((button) => button.pressed || button.value > 0.5));
  previousGamepadAxes.set(gamepad.index, [...gamepad.axes]);
}
