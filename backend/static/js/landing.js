(async function loadPlans() {
  const container = document.getElementById("planList");
  try {
    const response = await fetch("/api/plans");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Couldn't load plans.");

    container.innerHTML = "";
    for (const plan of data.plans) {
      const card = document.createElement("div");
      card.className = "plan-card";

      const header = document.createElement("div");
      header.className = "plan-card-header";
      const name = document.createElement("span");
      name.className = "plan-name";
      name.textContent = plan.label;
      const price = document.createElement("span");
      price.className = "plan-price";
      price.textContent = `$${plan.price_usd.toFixed(2)}`;
      header.appendChild(name);
      header.appendChild(price);

      const callsRange =
        plan.estimated_calls_low === plan.estimated_calls_high
          ? `~${plan.estimated_calls_low}`
          : `~${plan.estimated_calls_low}–${plan.estimated_calls_high}`;

      const details = document.createElement("p");
      details.className = "plan-details";
      details.textContent = `${plan.credit_tokens.toLocaleString()} tokens · ${callsRange} reviews`;

      const btn = document.createElement("a");
      btn.className = "btn btn-primary";
      btn.style.width = "100%";
      btn.style.textAlign = "center";
      btn.style.display = "block";
      btn.href = "/app";
      btn.textContent = "Get Started";

      card.appendChild(header);
      card.appendChild(details);
      card.appendChild(btn);
      container.appendChild(card);
    }
  } catch (err) {
    container.innerHTML = `<p class="plan-loading">Couldn't load pricing right now.</p>`;
  }
})();
