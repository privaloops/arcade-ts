.PHONY: help image verify-structure boot-test flash clean distclean

# pi-gen is cloned on demand into sibling dir `pi-gen/` (kept outside
# the monorepo root so it's invisible to workspaces). Override
# PIGEN=/somewhere/else if you already have it checked out.
PIGEN_REPO   ?= https://github.com/RPi-Distro/pi-gen.git
# 'arm64' targets Bookworm 64-bit (what the RPi 5 ships with). The
# 'master' branch still defaults to armhf (linux32 personality) and
# fails out of the gate on Apple Silicon / Docker Desktop's ARM64
# emulation. Override if you need a different target.
PIGEN_BRANCH ?= arm64
PIGEN        ?= $(CURDIR)/pi-gen
STAGE_NAME   := stage-sprixe
DEPLOY_DIR   := $(PIGEN)/deploy
IMG_GLOB     := $(DEPLOY_DIR)/*-sprixe-arcade*.img.xz
DEVICE       ?=

help:
	@echo "Sprixe Arcade — RPi kiosk image"
	@echo ""
	@echo "Targets:"
	@echo "  make image              — clone pi-gen (if missing) and build the .img.xz via Docker"
	@echo "  make verify-structure   — inspect the latest built image with libguestfs (Docker)"
	@echo "  make boot-test          — smoke-boot the image in QEMU (best-effort, approximates RPi 4)"
	@echo "  make flash DEVICE=/dev/diskN — dd the latest image to an SD card (requires sudo)"
	@echo "  make clean              — remove pi-gen work + deploy directories"
	@echo "  make distclean          — clean + remove the cloned pi-gen checkout"
	@echo ""
	@echo "Variables (override on the CLI):"
	@echo "  PIGEN=$(PIGEN)"
	@echo "  PIGEN_BRANCH=$(PIGEN_BRANCH)"

$(PIGEN):
	git clone --depth 1 --branch $(PIGEN_BRANCH) $(PIGEN_REPO) $(PIGEN)

image: $(PIGEN)
	# Inject our stage + config into the pi-gen checkout. The symlink
	# makes edits to packages/sprixe-image/stage-sprixe take effect
	# immediately on the next build without re-copying.
	@rm -f $(PIGEN)/$(STAGE_NAME)
	@ln -s $(CURDIR)/stage-sprixe $(PIGEN)/$(STAGE_NAME)
	@cp $(CURDIR)/config $(PIGEN)/config
	# Docker Desktop on macOS does not ship the binfmt_misc handlers
	# that pi-gen's debootstrap needs to chroot into the arm64 rootfs.
	# Register them once per boot; the install is idempotent.
	docker run --privileged --rm tonistiigi/binfmt --install all >/dev/null
	# Apple Silicon + Docker Desktop: the base Debian container pi-gen
	# uses for debootstrap ships an older debian-archive-keyring that
	# doesn't have the current Bookworm signing keys. Stage0's first
	# `apt-get update` inside the fresh chroot fails NO_PUBKEY as a
	# result. Relax the first-pass GPG verification here — every later
	# stage runs after the chroot has picked up the up-to-date keyring
	# from the repos themselves, so strict signing is back on for all
	# real package installs.
	find $(PIGEN)/stage0 -type f -name '*.sh' \
	  -exec sed -i.bak 's|apt-get update|apt-get update -o Acquire::AllowInsecureRepositories=true|g' {} +
	find $(PIGEN)/stage0 -type f -name '*.sh' \
	  -exec sed -i.bak 's|apt-get install|apt-get install --allow-unauthenticated|g' {} +
	find $(PIGEN)/stage0 -name '*.bak' -delete
	# Clean up any zombie pigen_work container from a previous failed
	# run — pi-gen refuses to start otherwise.
	@docker rm -v pigen_work 2>/dev/null || true
	# pi-gen's build-docker.sh mounts the repo into a Debian container
	# and runs the full pipeline. Needs root to loop-mount the rootfs.
	cd $(PIGEN) && sudo ./build-docker.sh

verify-structure:
	@./scripts/verify-image.sh "$(IMG_GLOB)"

boot-test:
	@./scripts/boot-test.sh "$(IMG_GLOB)"

flash:
	@[ -n "$(DEVICE)" ] || (echo "error: set DEVICE=/dev/diskN (see 'diskutil list')"; exit 1)
	@./scripts/flash.sh "$(IMG_GLOB)" "$(DEVICE)"

clean:
	@docker rm -v pigen_work 2>/dev/null || true
	@if [ -d "$(PIGEN)" ]; then \
	  cd $(PIGEN) && sudo ./build-docker.sh clean || true; \
	  sudo rm -rf $(PIGEN)/work $(DEPLOY_DIR); \
	fi

distclean: clean
	rm -rf $(PIGEN)
