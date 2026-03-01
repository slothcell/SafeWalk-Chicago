// Export a simple theme preset object to avoid depending on
// external theme packages at runtime. This file provides the
// semantic tokens used across the app UI.

export const SafeWalkPreset: any = {
  semantic: {
    colorScheme: {
      light: {
        semantic: {
          primary: {
            500: '#5E6C5B', // Forest Green (Safe)
            600: '#4E5C4C'
          },
          warning: {
            500: '#686867' // Storm Cloud (Moderate)
          },
          danger: {
            500: '#162A2C' // Midnight (Avoid)
          },
          info: {
            500: '#D6E0E2' // Sky Blue
          },
          surface: {
            0: '#FEFCF6',   // Cloud White
            100: '#F4EFE6'  // Fresh Cream
          },
          text: {
            primary: '#162A2C',
            secondary: '#5E6C5B'
          },
          border: '#D6E0E2'
        }
      }
    }
  }
}

export default SafeWalkPreset