import { mountPlayer } from "../ui/player";

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app");
mountPlayer(root);
