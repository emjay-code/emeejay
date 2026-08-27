#!/bin/bash
set -e
cat chunks_html/html_*.txt > index.html
cat chunks_css/css_*.txt > styles.css
echo "Build complete: reconstructed index.html and styles.css from chunks"
