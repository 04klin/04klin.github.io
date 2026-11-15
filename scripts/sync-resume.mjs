// Copies the latest resume PDF from the sibling `resume` repository into the
// site. Runs before `npm run dev` and `npm run build`. Where that repository
// does not exist (GitHub Actions, another machine), it does nothing and the
// committed copy is used.
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(
  new URL("../../resume/resume.pdf", import.meta.url),
);
const target = fileURLToPath(
  new URL("../public/assets/resume.pdf", import.meta.url),
);

if (!existsSync(source)) {
  console.log("sync-resume: no ../resume/resume.pdf, keeping committed copy");
} else if (
  existsSync(target) &&
  readFileSync(source).equals(readFileSync(target))
) {
  console.log("sync-resume: already up to date");
} else {
  copyFileSync(source, target);
  console.log("sync-resume: copied new resume, remember to commit it");
}
