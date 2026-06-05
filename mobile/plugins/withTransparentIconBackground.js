const { withAndroidColors } = require('expo/config-plugins');

/** adaptive icon 배경을 투명 처리 (나침반 foreground만 보이게) */
function withTransparentIconBackground(config) {
  return withAndroidColors(config, (colors) => {
    colors.iconBackground = '#00000000';
    return colors;
  });
}

module.exports = withTransparentIconBackground;
