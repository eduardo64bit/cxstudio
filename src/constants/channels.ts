import type { FlowChannel } from "../types/flow";

export const CHANNEL_LABELS: Record<FlowChannel, string> = {
  none: "Nenhum",
  web: "Web",
  app: "Aplicativo",
  sms: "SMS",
  social: "Redes sociais",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  email: "E-mail",
  voice: "Voz",
};
