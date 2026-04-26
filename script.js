const menuButton = document.querySelector(".menu-toggle");
const menu = document.querySelector("#menu");

if (menuButton && menu) {
  menuButton.addEventListener("click", () => {
    const open = menu.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", open ? "true" : "false");
  });
}

const currentPage = location.pathname.split("/").pop() || "index.html";
document.querySelectorAll(".nav-links a").forEach((link) => {
  const href = link.getAttribute("href");
  if (href === currentPage || (location.pathname.includes("/conseils/") && href.endsWith("conseils.html"))) {
    link.classList.add("active");
  }
});

const reveals = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  reveals.forEach((item) => observer.observe(item));
} else {
  reveals.forEach((item) => item.classList.add("is-visible"));
}

const contactForm = document.querySelector("[data-contact-form]");
if (contactForm) {
  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(contactForm);
    const name = data.get("name");
    const email = data.get("email");
    const message = data.get("message");
    const subject = encodeURIComponent(`Demande de contact - ${name}`);
    const body = encodeURIComponent(`${message}\n\nNom : ${name}\nEmail : ${email}`);
    const note = document.querySelector("[data-form-note]");
    if (note) note.textContent = "Votre application e-mail va s'ouvrir pour envoyer le message au cabinet.";
    window.location.href = `mailto:dentistevaldeurope@gmail.com?subject=${subject}&body=${body}`;
  });
}
