(function () {
  document.documentElement.classList.add("js");

  var header = document.querySelector("[data-header]");
  var dialog = document.querySelector("[data-lightbox]");
  var dialogImage = document.querySelector("[data-lightbox-image]");
  var dialogCaption = document.querySelector("[data-lightbox-caption]");
  var closeButton = document.querySelector("[data-lightbox-close]");
  var navToggle = document.querySelector("[data-nav-toggle]");
  var primaryNav = document.querySelector("#primary-nav");
  var mobileBooking = document.querySelector(".mobile-booking");
  var navBackdrop = null;
  var lastTrigger = null;

  function setBackgroundInert(isInert) {
    document.querySelectorAll("main, footer, .mobile-booking").forEach(function (element) {
      if (isInert) {
        if (!element.hasAttribute("inert")) {
          element.setAttribute("data-nav-inert-added", "");
          element.setAttribute("inert", "");
        }
      } else if (element.hasAttribute("data-nav-inert-added")) {
        element.removeAttribute("inert");
        element.removeAttribute("data-nav-inert-added");
      }
    });
  }

  document.querySelectorAll('a[target="_blank"]').forEach(function (link) {
    var announcement = " (opens in a new tab)";
    var existingLabel = link.getAttribute("aria-label");

    if (existingLabel) {
      if (!existingLabel.toLowerCase().includes("opens in a new tab")) {
        link.setAttribute("aria-label", existingLabel + announcement);
      }
    } else if (!link.textContent.toLowerCase().includes("opens in a new tab")) {
      var note = document.createElement("span");
      note.className = "visually-hidden";
      note.textContent = announcement;
      link.appendChild(note);
    }

    if (!link.classList.contains("button") && !link.classList.contains("mobile-booking")) {
      var icon = document.createElement("span");
      icon.className = "new-window-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "\u2197";
      link.appendChild(icon);
    }
  });

  function updateHeader() {
    if (!header) {
      return;
    }
    header.classList.toggle("is-scrolled", window.scrollY > 20);
  }

  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });

  function updateMobileBooking() {
    if (!mobileBooking) {
      return;
    }

    var canUseFixedBooking = window.matchMedia
      ? window.matchMedia("(max-width: 700px) and (min-height: 560px) and (orientation: portrait)").matches
      : window.innerWidth <= 700 && window.innerHeight >= 560 && window.innerHeight >= window.innerWidth;
    var isNavOpen = Boolean(header && header.classList.contains("is-nav-open"));
    var isHidden = window.scrollY < 160 || !canUseFixedBooking || isNavOpen;
    mobileBooking.classList.toggle("is-hidden", isHidden);
    mobileBooking.setAttribute("aria-hidden", isHidden ? "true" : "false");
    if (isHidden) {
      mobileBooking.tabIndex = -1;
    } else {
      mobileBooking.removeAttribute("tabindex");
    }
  }

  updateMobileBooking();
  window.addEventListener("scroll", updateMobileBooking, { passive: true });
  window.addEventListener("resize", updateMobileBooking);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", updateMobileBooking);
  }

  if (header && navToggle && primaryNav) {
    navBackdrop = document.createElement("div");
    navBackdrop.className = "nav-backdrop";
    navBackdrop.setAttribute("aria-hidden", "true");
    document.body.appendChild(navBackdrop);
  }

  function setNavOpen(isOpen, restoreFocus) {
    if (!header || !navToggle) {
      return;
    }

    header.classList.toggle("is-nav-open", isOpen);
    document.body.classList.toggle("is-nav-open", isOpen);
    setBackgroundInert(isOpen);
    navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    navToggle.setAttribute("aria-label", isOpen ? "Close site navigation" : "Open site navigation");
    if (navBackdrop) {
      navBackdrop.classList.toggle("is-visible", isOpen);
    }
    updateMobileBooking();

    if (!isOpen && restoreFocus) {
      navToggle.focus();
    }
  }

  if (navToggle) {
    navToggle.addEventListener("click", function () {
      setNavOpen(!header.classList.contains("is-nav-open"));
    });
  }

  if (navBackdrop) {
    navBackdrop.addEventListener("click", function () {
      setNavOpen(false, true);
    });
  }

  if (primaryNav) {
    primaryNav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        setNavOpen(false);
      });
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && header && header.classList.contains("is-nav-open")) {
      event.preventDefault();
      setNavOpen(false, true);
    }
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth > 1060 && header && header.classList.contains("is-nav-open")) {
      setNavOpen(false);
    }
  });

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

    if (typeof dialog.close === "function" && dialog.open) {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
      afterLightboxClose();
    }
  }

  function afterLightboxClose() {
    if (dialogImage) {
      dialogImage.removeAttribute("src");
      dialogImage.alt = "";
    }

    if (dialogCaption) {
      dialogCaption.textContent = "";
    }

    if (lastTrigger) {
      lastTrigger.focus();
      lastTrigger = null;
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

    dialog.addEventListener("close", afterLightboxClose);
  }
})();
