import { parser } from "@lezer/markdown";
import { LRLanguage, LanguageSupport } from "@codemirror/language";
import { cardpotBracketSyntax } from "./brackets/bracketInlineParser";
import { cardpotTagSyntax } from "./tags/tagInlineParser";
// Built on @lezer/markdown's CommonMark grammar, but most of
// CommonMark is stripped out (see disabledForNow below) and Cardpot's
// own bracket notations are the primary thing this actually parses.
// Named for what it does (Cardpot's own inline syntax), not for the
// library it happens to be built on.
const disabledForNow = [
  "ATXHeading1",
  "ATXHeading2",
  "ATXHeading3",
  "ATXHeading4",
  "ATXHeading5",
  "ATXHeading6",
  "SetextHeading1",
  "SetextHeading2",
  "Blockquote",
  "HorizontalRule",
  "BulletList",
  "OrderedList",
  "FencedCode",
  "CodeBlock",
  "HTMLBlock",
  "CommentBlock",
  "ProcessingInstructionBlock",
  "LinkReference",
];

const extendedParser = parser.configure([
  { remove: disabledForNow },
  cardpotBracketSyntax,
  cardpotTagSyntax,
]);

export const cardpotSyntaxLanguage = LRLanguage.define({
  parser: extendedParser,
  languageData: { commentTokens: {} },
});

export function cardpotSyntax(): LanguageSupport {
  return new LanguageSupport(cardpotSyntaxLanguage);
}
