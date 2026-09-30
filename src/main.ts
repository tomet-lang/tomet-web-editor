import { mount } from "svelte";
import "@shion/ui/themes/theme.css";
import App from "./App.svelte";

const target = document.getElementById("app");
if (target) {
	mount(App, { target });
}
