package main

/*
#include <stdlib.h>
*/
import "C"
import (
	"strings"
	"unsafe"

	"github.com/PuerkitoBio/goquery"
	md "github.com/firecrawl/html-to-markdown"
	"github.com/firecrawl/html-to-markdown/plugin"
)

//export ConvertHTMLToMarkdown
func ConvertHTMLToMarkdown(html *C.char) *C.char {
	converter := md.NewConverter("", true, nil)
	converter.Use(plugin.GitHubFlavored())
	converter.Use(plugin.RobustCodeBlock())

	// issue 3583: <button>/<label> (used by CMP cookie widgets) are inline by default, so adjacent
	// ones glue into a single token ("FunktionalFunktional"), corrupting the markdown for downstream
	// LLMs. Treat them as block-level so siblings separate. Genuine inline formatting (<b>, <strong>,
	// <span>) is untouched, so words like "Firecrawl" stay on one line.
	converter.AddRules(md.Rule{
		Filter: []string{"button", "label"},
		Replacement: func(content string, selec *goquery.Selection, opt *md.Options) *string {
			content = strings.TrimSpace(content)
			if content == "" {
				return md.String("")
			}
			return md.String("\n\n" + content + "\n\n")
		},
	})

	markdown, err := converter.ConvertString(C.GoString(html))
	if err != nil {
		// log.Fatal(err)
	}
	return C.CString(markdown)
}

//export FreeCString
func FreeCString(s *C.char) {
	C.free(unsafe.Pointer(s))
}

func main() {
	// This function is required for the main package
}
