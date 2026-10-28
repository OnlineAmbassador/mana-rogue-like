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

function applyGamepadDeadzone(value) {
  const deadzone = 0.22;
  const magnitude = Math.abs(value);
  return magnitude <= deadzone ? 0 : Math.sign(value) * (magnitude - deadzone) / (1 - deadzone);
}

function pollGamepad() {
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
  if (mode === 'playing' && lastInputMode === 'controller') {
    if (aimingWithRightStick) {
      mouseAimActive = false;
      player.lookX = gamepadInput.aimX;
      player.lookY = gamepadInput.aimY;
    }
  }

  const menuDirection = dpadX || (Math.abs(horizontalAxis) > 0.6 ? Math.sign(horizontalAxis) : 0);
  const menuVertical = dpadY || (Math.abs(verticalAxis) > 0.6 ? Math.sign(verticalAxis) : 0);
  if (mode !== pollGamepad.lastMode) {
    audioFocus = mode === 'select' && AUDIO_FOCUS_ORDER.includes(menuFocus) ? menuFocus : null;
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
  if (mode === 'select' || mode === 'prologue' || mode === 'paused') {
    if (mode !== 'select' && menuVertical !== 0 && menuVertical !== previousMenuVertical) {
      stepAudioFocus(menuVertical);
      audioConsumed = true;
    }
    if (handleAudioPanelPad(menuDirection, wasButtonPressed(0))) audioConsumed = true;
  } else {
    handleAudioPanelPad.previousHorizontal = 0;
  }
  const audioFocused = audioFocus !== null && (mode === 'select' || mode === 'prologue' || mode === 'paused');
  if (!audioFocused && !audioConsumed) {
    if (mode === 'prologue' && menuDirection !== 0 && menuDirection !== previousMenuDirection) {
      advancePrologue(menuDirection);
    } else if (mode === 'select' && menuDirection !== 0 && menuDirection !== previousMenuDirection) {
      chooseCharacter(menuDirection > 0 ? 'ArrowRight' : 'ArrowLeft');
    } else if (mode === 'tutorial' && menuDirection !== 0 && menuDirection !== previousMenuDirection) {
      stepTutorial(menuDirection);
    }
  }
  previousMenuDirection = mode === 'select' || mode === 'prologue' || mode === 'tutorial' ? menuDirection : 0;
  if (mode === 'select' && menuVertical !== 0 && menuVertical !== previousMenuVertical) moveMenuFocus(menuVertical);
  previousMenuVertical = mode === 'select' || mode === 'prologue' || mode === 'paused' ? menuVertical : 0;

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
    if (wasButtonPressed(8)) openControls('select');
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
  } else if (mode === 'paused') {
    if (wasButtonPressed(9) || (!audioFocused && wasButtonPressed(0))) resumeGame();
    else if (wasButtonPressed(1)) {
      if (audioFocused) audioFocus = null;
      else exitToTitle();
    } else if (wasButtonPressed(8)) openControls('paused');
  } else if (mode === 'gameover' || mode === 'won') {
    if (wasButtonPressed(0) || wasButtonPressed(9)) {
      mode = 'select';
      selectedIndex = 0;
      updateHud();
    }
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
