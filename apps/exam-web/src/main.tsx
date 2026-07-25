import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ExamApp } from "./App";

const root = document.getElementById("root");

if (!root) {
	throw new Error("Root element not found");
}

createRoot(root).render(
	<StrictMode>
		<ExamApp />
	</StrictMode>,
);
