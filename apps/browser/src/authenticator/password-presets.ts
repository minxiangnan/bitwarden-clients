export const PasswordPresets = Object.freeze([
  {
    id: "strong",
    labelKey: "passwordPresetStrong",
    options: {
      type: "password" as const,
      length: 20,
      uppercase: true,
      lowercase: true,
      number: true,
      special: true,
      minUppercase: 1,
      minLowercase: 1,
      minNumber: 1,
      minSpecial: 1,
      ambiguous: false,
    },
  },
  {
    id: "pin",
    labelKey: "passwordPresetPin",
    options: {
      type: "password" as const,
      length: 6,
      uppercase: false,
      lowercase: false,
      number: true,
      special: false,
      minNumber: 6,
      ambiguous: false,
    },
  },
  {
    id: "passphrase",
    labelKey: "passwordPresetPhrase",
    options: {
      type: "passphrase" as const,
      numWords: 5,
      wordSeparator: "-",
      capitalize: true,
      includeNumber: true,
    },
  },
]);
