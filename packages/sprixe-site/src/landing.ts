import { inject } from "@vercel/analytics";

inject();

const facade = document.querySelector<HTMLButtonElement>(".hero-video-facade");
if (facade) {
  facade.addEventListener("click", () => {
    const id = facade.dataset.ytId;
    if (!id) return;
    const iframe = document.createElement("iframe");
    iframe.className = "hero-video";
    iframe.src = `https://www.youtube.com/embed/${id}?autoplay=1`;
    iframe.title = "Sprixe — CPS1 Arcade Studio demo";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.setAttribute("frameborder", "0");
    facade.replaceWith(iframe);
  }, { once: true });
}
