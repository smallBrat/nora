export const EMAIL_PROVIDER_PRESETS = {
  gmail: {
    label: "Gmail",
    imap: { host: "imap.gmail.com", port: 993, secure: true },
    smtp: { host: "smtp.gmail.com", port: 465, secure: true },
  },
  outlook: {
    label: "Outlook",
    imap: { host: "outlook.office365.com", port: 993, secure: true },
    smtp: { host: "smtp.office365.com", port: 587, secure: false },
  },
  custom: {
    label: "Custom",
    imap: { host: "", port: 993, secure: true },
    smtp: { host: "", port: 587, secure: false },
  },
} as const;

export type EmailProviderPresetId = keyof typeof EMAIL_PROVIDER_PRESETS;
