/* Shop room art: market-stall pieces from the Artis market sheet, drawn unstretched, plus plain canvas text and shapes. */

const SHOP_ART = {
  // Pixel scale for sheet pieces; nearest-neighbour, so the pixels stay crisp.
  scale: 1.5,
  // Source rectangles [x, y, width, height] in artis-market.png, measured from the sheet's alpha channel.
  pieces: {
    stall: [352, 0, 128, 96],
    counter: [352, 104, 64, 55],
    bannerLeft: [256, 0, 32, 96],
    bannerRight: [320, 0, 32, 96],
    gems: [416, 104, 94, 55],
  },
};

// The keeper stands at the room centre; the room size is only known once game.js has loaded.
function shopMerchantPosition() {
  return { x: ROOM_W / 2, y: ROOM_H / 2 + 26 };
}

// `shopMarketSheet` is loaded in game.js: loadAsset needs `artwork`, which only exists once game.js has run.
function shopSheetReady() {
  return shopMarketSheet.complete && shopMarketSheet.naturalWidth > 0;
}

// Draws a sheet piece with its bottom edge centred on (centerX, bottomY).
function drawShopPiece(name, centerX, bottomY, scale = SHOP_ART.scale) {
  if (!shopSheetReady()) return;
  const [sx, sy, sw, sh] = SHOP_ART.pieces[name];
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(shopMarketSheet, sx, sy, sw, sh,
    Math.round(centerX - (sw * scale) / 2), Math.round(bottomY - sh * scale), Math.round(sw * scale), Math.round(sh * scale));
  ctx.restore();
}

// Splits text into at most maxLines lines that fit maxWidth; the last line gets an ellipsis if text is left over.
function wrapShopText(text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (let index = 0; index < words.length; index += 1) {
    const candidate = line ? `${line} ${words[index]}` : words[index];
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = words[index];
    if (lines.length === maxLines - 1) {
      line = words.slice(index).join(' ');
      break;
    }
  }
  if (line) lines.push(line);
  const last = lines.length - 1;
  if (last >= 0) {
    let fitted = lines[last];
    while (fitted.length > 1 && ctx.measureText(fitted).width > maxWidth) fitted = `${fitted.slice(0, -2)}…`;
    lines[last] = fitted;
  }
  return lines;
}

// The detail lines sit inside the ring so they never reach the stalls below.
function drawShopPad(position, label, accent, details, lit) {
  const pulse = prefersReducedMotion() ? 0 : Math.sin(elapsed * 3) * 2;
  ctx.save();
  ctx.fillStyle = lit ? 'rgba(244, 215, 142, 0.34)' : 'rgba(40, 34, 26, 0.5)';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(position.x, position.y, 40 + (lit ? pulse : 0), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f2e5c6';
  ctx.font = 'bold 13px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(label, position.x, position.y - 3);
  ctx.font = '10px Arial';
  ctx.fillStyle = lit ? '#ffe9a8' : '#d3c4a6';
  details.forEach((line, index) => ctx.fillText(line, position.x, position.y + 12 + index * 12, 70));
  ctx.restore();
}

function drawShopCard(item, spot, width, index) {
  const height = 64;
  const x = Math.round(spot.x - width / 2);
  const y = spot.y + 30;
  const affordable = coins >= item.cost || item.purchased;
  ctx.save();
  drawManaPanel(x, y, width, height, item.purchased ? '#77936a' : affordable ? '#c9a65a' : '#9a6666');
  ctx.globalAlpha = item.purchased ? 0.5 : 1;
  ctx.textAlign = 'left';
  ctx.font = 'bold 12px Arial';
  ctx.fillStyle = item.purchased ? '#9bb38e' : '#f2dfa9';
  ctx.fillText(item.name, x + 10, y + 20, width - 56);
  ctx.textAlign = 'right';
  ctx.fillStyle = item.purchased ? '#9bb38e' : affordable ? '#ffe18b' : '#e28a8a';
  ctx.fillText(`${item.cost}z`, x + width - 10, y + 20);
  ctx.textAlign = 'left';
  ctx.font = '10px Arial';
  ctx.fillStyle = '#d4c7ae';
  const lines = item.purchased ? ['SOLD'] : wrapShopText(item.description, width - 20, 3);
  lines.forEach((line, lineIndex) => ctx.fillText(line, x + 10, y + 34 + lineIndex * 11, width - 20));
  ctx.restore();
  if (nearestShopSlot() === index) {
    ctx.save();
    ctx.fillStyle = '#fff0a8';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('[E] BUY', spot.x, spot.y - 40);
    ctx.restore();
  }
}

function drawShopRoom() {
  const stock = currentRoom.shopStock || [];
  // Back wall: striped banners and the merchant's stall, with the keeper in front of its counter.
  drawShopPiece('bannerLeft', 130, 214);
  drawShopPiece('bannerRight', ROOM_W - 130, 214);
  const merchant = shopMerchantPosition();
  drawShopPiece('stall', merchant.x, merchant.y + 26);
  drawHumanoid(humanoidSprites.neutral.image, 0, merchant.x, merchant.y + 8, 1.35, 40);
  drawHead('keeper', 'down', merchant.x, merchant.y + 8, 1.35);
  drawShopPiece('counter', merchant.x - 48, merchant.y + 44);
  drawShopPiece('counter', merchant.x + 48, merchant.y + 44);
  ctx.save();
  // A plate keeps the name readable over the worn paving that leads to the south door.
  drawManaPanel(merchant.x - 44, merchant.y + 47, 88, 22);
  ctx.fillStyle = '#f2e5c6';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('MERCHANT', merchant.x, merchant.y + 62);
  ctx.restore();

  // Sell pad (walk on) and repair pad (stand on, then interact) beside the stall.
  const sellPad = sellPadPosition();
  const repairPad = repairPadPosition();
  drawShopPiece('gems', sellPad.x, sellPad.y - 46, 0.9);
  const carried = materialCount();
  drawShopPad(sellPad, 'SELL', '#d7b66e',
    carried > 0 ? [`${carried} for`, `${materialSaleValue()}z`] : ['ore and', 'crystals'], carried > 0);
  const missing = armorMissing();
  drawShopPad(repairPad, 'REPAIR', '#9fd39a',
    armorCapacity() > 0 ? [`[E] ${repairCostPerPoint()}z each`, `${missing} missing`] : ['needs', 'armor'], missing > 0);

  // Item stalls: a counter piece under each pedestal, then the price card.
  const width = shopStallWidth(stock.length || 3);
  stock.forEach((item, index) => {
    const spot = shopPedestalPosition(index);
    drawShopPiece('counter', spot.x, spot.y + 30, 1);
    ctx.save();
    ctx.globalAlpha = item.purchased ? 0.4 : 1;
    ctx.fillStyle = 'rgba(16, 14, 19, 0.55)';
    ctx.strokeStyle = coins >= item.cost || item.purchased ? '#d9bd83' : '#9a6666';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(spot.x, spot.y, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    drawShopItemIcon(item, spot.x, spot.y);
    ctx.restore();
    drawShopCard(item, spot, width, index);
  });
}
