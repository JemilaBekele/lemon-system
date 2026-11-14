import { createTamagui } from 'tamagui'
import { createInterFont } from '@tamagui/font-inter'
import { shorthands } from '@tamagui/shorthands'
import { themes, tokens } from '@tamagui/themes'
import { createMedia } from '@tamagui/react-native-media-driver'
import { Palette, orangeScale } from './constants/palette'

const headingFont = createInterFont()
const bodyFont = createInterFont()

// Apply the brand palette to the light theme and all its sub-themes
// (light_Button, light_orange, ...), so `$orangeN` and `$background`
// resolve the same everywhere. The app runs in light mode only.
const brandThemes = Object.fromEntries(
  Object.entries(themes).map(([name, theme]) =>
    name === 'light' || name.startsWith('light_')
      ? [
          name,
          {
            ...theme,
            ...orangeScale,
            ...(name === 'light' && {
              background: Palette.background,
              color: Palette.textPrimary,
              borderColor: Palette.border,
            }),
          },
        ]
      : [name, theme]
  )
) as typeof themes

export const config = createTamagui({
  defaultFont: 'body',
  fonts: {
    body: bodyFont,
    heading: headingFont,
  },
  themes: brandThemes,
  tokens,
  shorthands,
  media: createMedia({
    xs: { maxWidth: 660 },
    sm: { maxWidth: 800 },
    md: { maxWidth: 1020 },
    lg: { maxWidth: 1280 },
    xl: { maxWidth: 1420 },
    xxl: { maxWidth: 1600 },
    gtXs: { minWidth: 660 + 1 },
    gtSm: { minWidth: 800 + 1 },
    gtMd: { minWidth: 1020 + 1 },
    gtLg: { minWidth: 1280 + 1 },
    short: { maxHeight: 820 },
    tall: { minHeight: 820 },
    hoverNone: { hover: 'none' },
    pointerCoarse: { pointer: 'coarse' },
  }),
})

export default config

export type Conf = typeof config

declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}