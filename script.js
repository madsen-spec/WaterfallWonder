(function () {
  var header = document.querySelector("[data-header]");
  var dialog = document.querySelector("[data-lightbox]");
  var dialogImage = document.querySelector("[data-lightbox-image]");
  var dialogCaption = document.querySelector("[data-lightbox-caption]");
  var closeButton = document.querySelector("[data-lightbox-close]");
  var lastTrigger = null;

  function updateHeader() {
    if (!header) {
      return;
    }
    header.classList.toggle("is-scrolled", window.scrollY > 20);
  }

  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });

  function openLightbox(button) {
    if (!dialog || !dialogImage || !dialogCaption) {
      return;
    }

    lastTrigger = button;
    dialogImage.src = button.getAttribute("data-full");
    dialogImage.alt = button.getAttribute("data-caption") || "Expanded Waterfall Wonder property photo.";
    dialogCaption.textContent = button.getAttribute("data-caption") || "";

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }

  function closeLightbox() {
    if (!dialog) {
      return;
    }

    if (typeof dialog.close === "function") {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }

    if (lastTrigger) {
      lastTrigger.focus();
    }
  }

  document.querySelectorAll(".gallery-button").forEach(function (button) {
    button.addEventListener("click", function () {
      openLightbox(button);
    });
  });

  function initCarousel(carousel) {
    var slides = Array.prototype.slice.call(carousel.querySelectorAll("[data-carousel-slide]"));
    var dots = Array.prototype.slice.call(carousel.querySelectorAll("[data-carousel-dot]"));
    var prev = carousel.querySelector("[data-carousel-prev]");
    var next = carousel.querySelector("[data-carousel-next]");
    var status = carousel.querySelector("[data-carousel-status]");
    var current = slides.findIndex(function (slide) {
      return slide.classList.contains("is-active");
    });

    if (!slides.length) {
      return;
    }

    if (current < 0) {
      current = 0;
    }

    function showSlide(index) {
      current = (index + slides.length) % slides.length;

      slides.forEach(function (slide, slideIndex) {
        var isActive = slideIndex === current;
        slide.classList.toggle("is-active", isActive);
        slide.setAttribute("aria-hidden", isActive ? "false" : "true");
      });

      dots.forEach(function (dot, dotIndex) {
        if (dotIndex === current) {
          dot.setAttribute("aria-current", "true");
        } else {
          dot.removeAttribute("aria-current");
        }
      });

      if (status) {
        var activeSlide = slides[current];
        var label = activeSlide.getAttribute("aria-label") || "Slide " + (current + 1) + " of " + slides.length;
        var source = activeSlide.querySelector(".review-slide__source, figcaption span");
        status.textContent = (source ? source.textContent + ". " : "") + label;
      }
    }

    if (prev) {
      prev.addEventListener("click", function () {
        showSlide(current - 1);
      });
    }

    if (next) {
      next.addEventListener("click", function () {
        showSlide(current + 1);
      });
    }

    dots.forEach(function (dot, dotIndex) {
      dot.addEventListener("click", function () {
        showSlide(dotIndex);
      });
    });

    carousel.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showSlide(current - 1);
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        showSlide(current + 1);
      }
    });

    showSlide(current);
  }

  document.querySelectorAll("[data-carousel]").forEach(initCarousel);

  if (closeButton) {
    closeButton.addEventListener("click", closeLightbox);
  }

  if (dialog) {
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) {
        closeLightbox();
      }
    });
  }
})();
