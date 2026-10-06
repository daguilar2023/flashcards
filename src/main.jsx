import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import FlashcardsApp from "./FlashcardsApp.jsx";
import { getCloudClient } from "./lib/cloud";
import "./index.css";

import "prismjs/themes/prism-okaidia.css";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-java";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-go";
import "prismjs/components/prism-json";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-bash";

async function mount() {
// Finish email-confirmation redirects before routing can replace the auth hash.
if (location.hash.includes("access_token=") || new URLSearchParams(location.search).has("code")) {
  try {
    const client = await getCloudClient();
    if (client) await client.auth.getSession();
  } catch { /* The account dialog reports configuration problems. */ }
}
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <FlashcardsApp />
    </HashRouter>
  </React.StrictMode>,
);
}
void mount();
