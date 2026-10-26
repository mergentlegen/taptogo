/**
 * How clients reach TapToGo: one WhatsApp number, no forms, no email. The message
 * text is URL-encoded into the link so the chat opens with the question already typed.
 */
const WHATSAPP_DIGITS = "77076897325";

export const salesContacts = {
  /** For display, in the format people read aloud. */
  whatsapp: "+7 707 689 73 25",
  whatsappHref: `https://wa.me/${WHATSAPP_DIGITS}`,
} as const;

/** The link with a ready-made first message (shown on the landing page). */
export function whatsappLink(message: string): string {
  return `${salesContacts.whatsappHref}?text=${encodeURIComponent(message)}`;
}
