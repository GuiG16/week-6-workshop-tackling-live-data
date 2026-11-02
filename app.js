import * as THREE from "https://esm.sh/three@0.169.0";
import { OrbitControls } from "https://esm.sh/three@0.169.0/examples/jsm/controls/OrbitControls.js";

const API = "https://en.wikipedia.org/w/api.php";
const els = {
  form: document.querySelector("#search-form"), input: document.querySelector("#search-input"),
  heading: document.querySelector("#topic-heading"), extract: document.querySelector("#extract"),
  image: document.querySelector("#story-image"), link: document.querySelector("#article-link"),
  words: document.querySelector("#word-count"), updated: document.querySelector("#updated-label"),
  views: document.querySelector("#total-views"), scene: document.querySelector("#scene-container"),
};
let chart;
document.querySelector("#today").textContent = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date()).toUpperCase();

async function getWiki(params, endpoint = API) {
  const url = new URL(endpoint);
  Object.entries({ origin: "*", format: "json", ...params }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Wikipedia request failed (${response.status})`);
  return response.json();
}

async function loadTopic(topic) {
  els.heading.textContent = topic;
  els.extract.textContent = "Loading the latest encyclopedic context…";
  els.updated.textContent = "FETCHING DATA";
  try {
    const search = await getWiki({ action: "query", list: "search", srsearch: topic, srlimit: "1", srprop: "snippet" });
    const pageTitle = search.query.search[0]?.title || topic;
    const [page, views, links] = await Promise.all([
      getWiki({ action: "query", prop: "extracts|pageimages|info", exintro: "1", explaintext: "1", piprop: "thumbnail", pithumbsize: "700", inprop: "url", titles: pageTitle }),
      loadViews(pageTitle),
      getWiki({ action: "query", prop: "links", plnamespace: "0", pllimit: "15", titles: pageTitle }),
    ]);
    const data = Object.values(page.query.pages)[0];
    renderStory(data);
    renderChart(views);
    renderConstellation(pageTitle, Object.values(links.query.pages)[0]?.links || []);
  } catch (error) {
    console.error(error);
    els.extract.textContent = "The live source is unavailable right now. Try another topic or check your connection.";
    els.updated.textContent = "SOURCE UNAVAILABLE";
    els.scene.innerHTML = '<div class="scene-loading">Unable to map connections</div>';
  }
}

async function loadViews(title) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 30);
  const stamp = date => date.toISOString().slice(0, 10).replaceAll("-", "");
  const endpoint = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/${encodeURIComponent(title)}/daily/${stamp(start)}/${stamp(end)}`;
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error("Pageview request failed");
  return response.json();
}

function renderStory(data) {
  const extract = data?.extract || "No summary was found for this topic.";
  els.extract.textContent = extract;
  els.words.textContent = `${extract.split(/\s+/).filter(Boolean).length} WORDS`;
  els.updated.textContent = "LIVE FROM MEDIAWIKI";
  els.link.href = data?.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(data?.title || "")}`;
  if (data?.thumbnail?.source) els.image.innerHTML = `<img src="${data.thumbnail.source}" alt="" />`;
  else els.image.innerHTML = '<span class="image-placeholder">W</span>';
}

function renderChart(data) {
  const items = data?.items || [];
  const values = items.map(item => item.views);
  const total = values.reduce((sum, value) => sum + value, 0);
  els.views.textContent = total > 999999 ? `${(total / 1000000).toFixed(1)}M` : total > 999 ? `${(total / 1000).toFixed(1)}K` : total.toLocaleString();
  if (chart) chart.destroy();
  chart = new Chart(document.querySelector("#views-chart"), {
    type: "line", data: { labels: items.map(item => item.timestamp.slice(4, 6) + "/" + item.timestamp.slice(6, 8)), datasets: [{ data: values, borderColor: "#ff744f", backgroundColor: "rgba(255,116,79,.12)", borderWidth: 2, pointRadius: 0, fill: true, tension: .35 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: { label: item => `${item.raw.toLocaleString()} views` } } }, scales: { x: { display: false }, y: { display: false, beginAtZero: true } } },
  });
}

function renderConstellation(title, related) {
  els.scene.innerHTML = "";
  const width = els.scene.clientWidth, height = 220;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, width / height, .1, 100);
  camera.position.z = 8;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.setSize(width, height); els.scene.appendChild(renderer.domElement);
  const group = new THREE.Group(); scene.add(group);
  const core = new THREE.Mesh(new THREE.SphereGeometry(.31, 24, 24), new THREE.MeshBasicMaterial({ color: 0xff744f }));
  group.add(core);
  const nodes = related.slice(0, 12).map((article, index) => {
    const angle = (index / 12) * Math.PI * 2;
    const radius = 2.1 + (index % 3) * .28;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(.08 + (index % 3) * .025, 12, 12), new THREE.MeshBasicMaterial({ color: 0x17231e }));
    mesh.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * .55, (index % 4 - 1.5) * .38);
    group.add(mesh);
    const points = [new THREE.Vector3(0, 0, 0), mesh.position.clone()];
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x9ca49a, transparent: true, opacity: .48 })));
    return { mesh, title: article.title };
  });
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableZoom = false; controls.enablePan = false; controls.autoRotate = true; controls.autoRotateSpeed = .55;
  const animate = () => { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }; animate();
  renderer.domElement.title = `${title} related articles`;
  const resize = () => { const nextWidth = els.scene.clientWidth; camera.aspect = nextWidth / height; camera.updateProjectionMatrix(); renderer.setSize(nextWidth, height); };
  window.addEventListener("resize", resize, { passive: true });
}

els.form.addEventListener("submit", event => { event.preventDefault(); const topic = els.input.value.trim(); if (topic) { loadTopic(topic); document.querySelector("#dashboard").scrollIntoView({ behavior: "smooth" }); } });
document.querySelectorAll("[data-topic]").forEach(button => button.addEventListener("click", () => { els.input.value = button.dataset.topic; els.form.requestSubmit(); }));
loadTopic("Climate change");
