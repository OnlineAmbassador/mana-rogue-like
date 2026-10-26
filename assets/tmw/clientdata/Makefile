# for pipefail
SHELL=/bin/bash
.SECONDARY:
.DELETE_ON_ERROR:

XSLTPROC = xsltproc

all:
	@echo "Normal: build pipeline"
	@echo "Standalone: check-png testxml testxml-full license icc"
	@echo "Groups: build check pipeline"


check: check-xml check-png testxml

PNGS = $(shell find . -type f -name "*.png")
check-png: $(patsubst %.png,out/%.png.ok,${PNGS})
	find . -name '*.png.ok' -delete
	find . -name '*.png.out' -delete
	find ./out/ -type d -delete
out/%.png.ok: out/%.png.out
	grep '32-bit RGB+alpha, non-interlaced, ' $< > $@
out/%.png.out: %.png
	mkdir -p ${@D}
	set -e -o pipefail; \
	pngcheck $< > $@

check-xml:
	cd ../tools/testxml/ ; ./xsdcheck.sh ; cat errors.txt

testxml:
	cd ../tools/testxml/ ; ./testxml.py stfu

testxml-full:
	cd ../tools/testxml/ ; ./testxml.py silent

client: build

build:
	cd ../tools/ ; make client

license:
	cd ../tools/licensecheck/ ; ./clientdata.sh

icc:
	cd ../tools/imagescheck/ ; ./icccheck.sh

pipeline: check-xml
	cd ../tools/testxml/ ; ./testxml.py silent |grep -v "Checking"
	#echo "Now using imagemagic to verify images..."
	#cd ../tools/imagescheck/ ; ./icccheck.sh
	@echo "Now run `make check-png` to check PNG images. Use `make contrib` if contributor list must be updated."
	@echo "Use `make icc` to verify for broken images, too."
