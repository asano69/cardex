// Package xmldoc parses the plain XML strings a ygo/Yjs document
// renders via crdt.Doc.GetXmlFragment(...).ToXML() (see
// docs/ygo/yxml.go for the format). It started as the paragraph regex
// and entity-unescaping buried in internal/serve/ydoc.go's
// buildPreview; split out into its own package once a second
// extraction -- the first image URL, for the cards "image" field --
// needed the same unescaping, and to leave room for whatever other
// scraping this format needs next.
package xmldoc

import (
	"regexp"
	"strings"
)

// unescaper reverses ygo's own xmlEscapeText/xmlEscapeAttr (see
// docs/ygo/yxml.go), turning entities like "&amp;" back into plain
// "&" for display or for use in a URL.
var unescaper = strings.NewReplacer(
	"&lt;", "<",
	"&gt;", ">",
	"&quot;", `"`,
	"&apos;", "'",
	"&amp;", "&",
)

// UnescapeText reverses ygo's XML entity escaping in s.
func UnescapeText(s string) string {
	return unescaper.Replace(s)
}

// firstImageRe matches the opening tag of the first <image> element,
// capturing its "src" attribute regardless of attribute order (ToXML
// sorts attributes alphabetically, so e.g. "alt" comes before "src"
// when both are present -- see docs/ygo/yxml.go's
// YXmlElement.ToXML). Images only ever enter a card's document as an
// actual <image> node -- see
// frontend/src/components/noteEditor/imageMarkdownPlugin.ts, which
// converts markdown/bracket image syntax into one on every
// transaction -- so by the time a document reaches ToXML() there is
// no markdown syntax left to detect; reading the node's own "src"
// attribute is enough.
var firstImageRe = regexp.MustCompile(`<image\b[^>]*\bsrc="([^"]*)"`)

// FirstImageSrc returns the unescaped "src" attribute of the first
// <image> element in xml, in document order, or "" if the document
// has no image.
func FirstImageSrc(xml string) string {
	m := firstImageRe.FindStringSubmatch(xml)
	if m == nil {
		return ""
	}
	return UnescapeText(m[1])
}
