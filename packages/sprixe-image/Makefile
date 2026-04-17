.PHONY: image clean

# pi-gen must be cloned alongside this directory (e.g. via submodule or CI step)
PIGEN ?= ../../pi-gen

image:
	cd $(PIGEN) && sudo ./build-docker.sh

clean:
	cd $(PIGEN) && sudo ./build-docker.sh clean
