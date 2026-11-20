import React from 'react';
import { Image } from 'expo-image';

// Static render of frontend/public/A_logo.svg (the original is animated, which native renderers can't draw).
const logo = require('../../assets/a_logo.png');

export function Logo({ size = 44 }: { size?: number }) {
  return <Image source={logo} style={{ width: size * (910 / 880), height: size }} contentFit="contain" />;
}
