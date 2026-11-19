/*
 * The terminal on the home page (Shell.astro). Once the boot screen is done
 * it types `cat /etc/motd` (the login notice, with the greeting) and `ls`; from there visitors click names in the output, which types
 * and runs the matching command, or type commands themselves (help lists
 * them). There are two hosts: the home folder on the site, and the "nas",
 * a read-only photo share where each album is a folder. Going into an album
 * gives the backdrop that album's season; leaving brings the visitor's own
 * season back.
 *
 * Everything shown is rendered at build time in Shell.astro; this only
 * clones the <template>s and keeps track of where the visitor is.
 */

import { openPhoto } from "./photos";
import { showSeason } from "./scene";
import type { Season } from "./seasons";
import { closeApp, isActive, openApp, registerApp } from "./windows";

interface AlbumData {
  dir: string;
  season: Season | null;
  link: string | null;
  photos: { name: string; alt: string; full: string }[];
}

interface ShellData {
  host: string;
  email: string;
  resume: string;
  github: string;
  flickr: string;
  camera: string;
  photoCount: number;
  projects: boolean;
  albums: AlbumData[];
}

type Command = (args: string[]) => boolean | Promise<boolean>;

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms: number) =>
  reduced()
    ? Promise.resolve()
    : new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Like `date`: Wed Nov 18 22:04:31 EST 2026 */
function dateLine() {
  const now = new Date();
  const [weekday, month, day, year] = now.toDateString().split(" ");
  const zone = now
    .toLocaleTimeString("en-US", { timeZoneName: "short" })
    .split(" ")
    .pop();
  return `${weekday} ${month} ${day} ${now.toTimeString().slice(0, 8)} ${zone} ${year}`;
}

export function setupShell(): void {
  const term = document.querySelector<HTMLElement>("[data-term]");
  if (!term || "ready" in term.dataset) return;
  const shell = term.closest<HTMLElement>("[data-desktop]")!;
  const win = term.closest<HTMLElement>("[data-window]")!;
  const title = win.querySelector<HTMLElement>("[data-window-title]")!;
  const data: ShellData = JSON.parse(term.dataset.shell ?? "{}");
  const log = term.querySelector<HTMLElement>("[data-term-log]")!;
  const inputLine = term.querySelector<HTMLElement>("[data-term-input-line]")!;
  const promptSlot = term.querySelector<HTMLElement>("[data-term-prompt]")!;
  const input = term.querySelector<HTMLInputElement>("[data-term-input]")!;
  const scroller = term.querySelector<HTMLElement>("[data-term-scroll]")!;

  // The static `ls` output (what shows without JavaScript) becomes the home
  // folder's listing; the log starts empty.
  const homeListing = log.querySelector("[data-out='home']")!.cloneNode(true);
  const motd = log.querySelector("[data-out='motd']")!.cloneNode(true);
  const promptMarkup = promptSlot.querySelector(".prompt")!.cloneNode(true);
  log.replaceChildren();
  term.dataset.ready = "";

  // Where the visitor is: the site's home folder, or the nas, in the albums
  // folder (dir null) or in one album.
  let host: "home" | "nas" = "home";
  let dir: string | null = null;
  let busy = false;
  // Each time the window opens, a new session starts (as in a real terminal
  // app); closing it ends the session. Work still running from an ended
  // session (typing, a login) checks this and stops.
  let session = 0;
  const history: string[] = [];
  let historyAt = 0;

  const album = (name: string) => data.albums.find((a) => a.dir === name);
  const hostName = () => (host === "nas" ? "nas" : data.host);
  const homeFiles = [
    "photos/",
    ...(data.projects ? ["projects/"] : []),
    "resume.pdf",
    "github.url",
    "email.txt",
  ];

  const path = () => (host === "nas" && dir ? `~/${dir}` : "~");

  function prompt() {
    const node = promptMarkup.cloneNode(true) as HTMLElement;
    node.querySelector(".prompt-user")!.textContent = `guest@${hostName()}`;
    node.querySelector(".prompt-path")!.textContent = path();
    return node;
  }

  /** The new prompt, and the window's title, which follows it. */
  function updatePrompt() {
    promptSlot.replaceChildren(prompt());
    title.textContent = `guest@${hostName()}: ${path()}`;
  }

  // Output goes into the block of the command that is running.
  let out: HTMLElement = log;

  function print(content: string | Node, kind?: "dim" | "err") {
    let node = content;
    if (typeof content === "string") {
      node = document.createElement("p");
      node.textContent = content;
      (node as HTMLElement).className = kind ? `term-${kind}` : "term-out";
    }
    out.append(node);
  }

  function template(name: string) {
    const found = shell.querySelector<HTMLTemplateElement>(
      `template[data-out="${name}"]`,
    );
    return found ? found.content.cloneNode(true) : document.createTextNode("");
  }

  /**
   * A path on the nas: the album it names, null for the albums folder
   * itself, or undefined if there is nothing there.
   */
  function resolve(path: string): AlbumData | null | undefined {
    let at = dir;
    let rest = path;
    if (["", "~", "/volume1/photos"].includes(rest)) return null;
    if (rest.startsWith("~/")) [at, rest] = [null, rest.slice(2)];
    else if (rest.startsWith("/volume1/photos/"))
      [at, rest] = [null, rest.slice(16)];
    else if (rest.startsWith("/")) return undefined;
    for (const part of rest.split("/").filter(Boolean)) {
      if (part === ".") continue;
      if (part === "..") {
        if (at === null) return undefined;
        at = null;
      } else if (at !== null || !album(part)) {
        return undefined;
      } else {
        at = part;
      }
    }
    return at === null ? null : album(at);
  }

  /** Opens a link in a new tab. */
  function visit(url: string) {
    window.open(url, "_blank", "noopener");
    return true;
  }

  const commands: Record<string, Command> = {
    help() {
      [
        "ls            list this folder",
        "cd <folder>   go into a folder (cd .. goes back)",
        "open <file>   open a photo or a link",
        "cat <file>    print a file",
        "ssh nas       log in to the photo share (cd photos does too)",
        "exit          log out of the nas, or close the terminal",
        "clear         clear the screen",
        "reboot        restart",
      ].forEach((line) => print(line));
      print(
        "Or just click a name. Tab completes, ↑ and ↓ go through history.",
        "dim",
      );
      return true;
    },

    ls(args) {
      const target = args.find((a) => !a.startsWith("-"));
      if (host === "home") {
        if (!target || target === "~" || target === ".") {
          print(homeListing.cloneNode(true));
          return true;
        }
        if (target.replace(/\/$/, "") === "photos") {
          print(template("albums"));
          return true;
        }
        print(
          `ls: cannot access '${target}': No such file or directory`,
          "err",
        );
        return false;
      }
      const found = target ? resolve(target) : dir ? album(dir) : null;
      if (found === undefined) {
        print(
          `ls: cannot access '${target}': No such file or directory`,
          "err",
        );
        return false;
      }
      print(template(found ? `album:${found.dir}` : "albums"));
      return true;
    },

    async cd(args) {
      const target = args[0] ?? "~";
      if (host === "home") {
        const name = target.replace(/\/$/, "");
        if (name === "~" || name === ".") return true;
        // photos/ is a network share: going in logs in to the nas first.
        const [first, ...rest] = name.split("/");
        if (first === "photos") {
          if (!(await commands.ssh(["nas"]))) return false;
          return rest.length ? commands.cd([rest.join("/")]) : true;
        }
        if (name === "projects" && data.projects) {
          location.href = "/projects";
          return true;
        }
        print(
          homeFiles.includes(name)
            ? `cd: not a directory: ${target}`
            : `cd: no such file or directory: ${target}`,
          "err",
        );
        return false;
      }
      const found = resolve(target);
      if (found === undefined) {
        print(
          target === ".." && dir === null
            ? "cd: ..: Permission denied (guest share)"
            : `cd: no such file or directory: ${target}`,
          "err",
        );
        return false;
      }
      dir = found?.dir ?? null;
      await showSeason(found?.season ?? null);
      return true;
    },

    pwd() {
      print(
        host === "home"
          ? "/home/guest"
          : `/volume1/photos${dir ? `/${dir}` : ""}`,
      );
      return true;
    },

    async ssh(args) {
      const mine = session;
      const target = args.find((a) => !a.startsWith("-"))?.replace(/^.*@/, "");
      if (!target) {
        print("usage: ssh nas", "err");
        return false;
      }
      if (target !== "nas" && target !== "nas.local") {
        print(
          `ssh: connect to host ${target} port 22: Connection refused`,
          "err",
        );
        return false;
      }
      if (host === "nas") {
        print("Already connected to nas.", "dim");
        return true;
      }
      print("Connecting to nas.local...", "dim");
      await sleep(400);
      print("Authenticated as guest (read-only).", "dim");
      await sleep(250);
      print(
        `${data.photoCount} photos in ${data.albums.length} albums, shot on a ${data.camera}.`,
      );
      await sleep(250);
      if (mine !== session) return false;
      [host, dir] = ["nas", null];
      return true;
    },

    async exit() {
      if (host === "home") {
        print("logout", "dim");
        await sleep(400);
        closeApp("terminal");
        return false;
      }
      print("Connection to nas.local closed.", "dim");
      [host, dir] = ["home", null];
      await showSeason(null);
      return true;
    },

    async open(args) {
      const target = args[0];
      if (!target) {
        print("usage: open <file>", "err");
        return false;
      }
      if (host === "home") {
        if (target === "resume.pdf") return visit(data.resume);
        if (target === "github.url") return visit(data.github);
        if (target === "email.txt") return commands.cat(args);
        if (target.replace(/\/$/, "") === "photos") return commands.cd(args);
        print(`open: ${target}: No such file`, "err");
        return false;
      }
      const slash = target.lastIndexOf("/");
      const folder = slash >= 0 ? resolve(target.slice(0, slash)) : resolve("");
      const file = target.slice(slash + 1);
      const inFolder = slash >= 0 ? folder : dir ? album(dir) : null;
      if (inFolder === undefined) {
        print(`open: ${target}: No such file`, "err");
        return false;
      }
      if (inFolder === null) {
        if (file === "flickr.url") return visit(data.flickr);
        if (album(file.replace(/\/$/, ""))) {
          print(`open: ${target}: Is a directory. Try: cd ${file}`, "err");
          return false;
        }
      } else {
        if (file === "album.url" && inFolder.link) return visit(inFolder.link);
        const index = inFolder.photos.findIndex((p) => p.name === file);
        if (index >= 0) {
          openPhoto(inFolder.dir, index);
          return true;
        }
      }
      print(`open: ${target}: No such file`, "err");
      return false;
    },

    cat(args) {
      const target = args[0];
      if (!target) {
        print("usage: cat <file>", "err");
        return false;
      }
      if (target === "/etc/motd") {
        print(motd.cloneNode(true));
        return true;
      }
      // The address is written out, not linked, to keep it from scrapers.
      if (target === "email.txt" || target === "~/email.txt") {
        print(data.email);
        return true;
      }
      if (host === "home" && target === "github.url") {
        print(data.github);
        return true;
      }
      if (host === "nas") {
        const here = dir ? album(dir) : null;
        if (!here && target === "flickr.url") {
          print(data.flickr);
          return true;
        }
        if (here && target === "album.url" && here.link) {
          print(here.link);
          return true;
        }
      }
      if (/\.(pdf|jpe?g)$/.test(target)) {
        print(`cat: ${target}: binary file. Try: open ${target}`, "err");
        return false;
      }
      print(`cat: ${target}: No such file or directory`, "err");
      return false;
    },

    clear() {
      log.replaceChildren();
      return true;
    },

    // Reloads the page, asking the layout's <head> script to show the boot
    // screen again (normally it shows once per visit).
    async reboot() {
      print("The system is going down for reboot NOW!", "dim");
      await sleep(900);
      try {
        sessionStorage.setItem("reboot", "1");
      } catch {
        // Without storage the page still reloads, just without the boot.
      }
      location.reload();
      return true;
    },
    whoami() {
      print("guest");
      return true;
    },
    hostname() {
      print(hostName());
      return true;
    },
    date() {
      print(dateLine());
      return true;
    },
    echo(args) {
      print(args.join(" "));
      return true;
    },
    sudo() {
      print(
        "guest is not in the sudoers file. This incident will be reported.",
        "err",
      );
      return false;
    },
    rm() {
      print("rm: Read-only file system", "err");
      return false;
    },
  };
  commands.logout = commands.exit;
  commands.cls = commands.clear;

  /** Runs one line (commands joined with && run until one fails). */
  async function run(line: string) {
    const mine = session;
    const block = document.createElement("div");
    block.className = "term-block";
    const echo = document.createElement("p");
    echo.className = "term-line";
    echo.append(prompt(), ` ${line}`);
    block.append(echo);
    log.append(block);
    out = block;
    if (line.trim()) history.push(line.trim());
    historyAt = history.length;

    for (const part of line.split("&&")) {
      const [name, ...args] = part.trim().split(/\s+/);
      if (!name) continue;
      const command = Object.hasOwn(commands, name) ? commands[name] : null;
      if (!command) {
        print(`${name}: command not found. Try: help`, "err");
        break;
      }
      const ok = await command(args);
      if (mine !== session) return;
      if (!ok) break;
    }
    updatePrompt();
    reveal(block);
  }

  /**
   * Brings a command's output into view inside the terminal: from its start
   * if it is tall (an album), otherwise down to the prompt.
   */
  function reveal(block: HTMLElement) {
    const behavior = reduced() ? "auto" : "smooth";
    if (!block.isConnected) return;
    if (block.offsetHeight > scroller.clientHeight * 0.6)
      block.scrollIntoView({ block: "start", behavior });
    else inputLine.scrollIntoView({ block: "nearest", behavior });
  }

  /** Types each line into the prompt, as if by hand, and runs it. */
  async function perform(lines: string[]) {
    if (busy) return;
    const mine = session;
    busy = true;
    input.readOnly = true;
    try {
      for (const line of lines) {
        input.value = "";
        if (reduced()) input.value = line;
        else
          for (const char of line) {
            input.value += char;
            await sleep(20 + Math.random() * 35);
            if (mine !== session) return;
          }
        await sleep(160);
        if (mine !== session) return;
        input.value = "";
        await run(line);
        if (mine !== session) return;
      }
    } finally {
      if (mine === session) {
        busy = false;
        input.readOnly = false;
        focusInput();
      }
    }
  }

  /** What a click on a name in the output runs, from where the visitor is. */
  function linesFor(goto: string): string[] {
    if (goto === "email") return ["cat email.txt"];
    if (goto === "photos" || goto === "albums") {
      if (host === "home") return ["cd photos && ls -l"];
      return dir ? ["cd .. && ls -l"] : ["ls -l"];
    }
    if (goto.startsWith("album:")) {
      const name = goto.slice(6);
      if (host === "home") return [`cd photos/${name} && ls`];
      if (dir === name) return ["ls"];
      return [`cd ${dir ? `../${name}` : name} && ls`];
    }
    return [];
  }

  const finePointer = matchMedia("(pointer: fine)");
  function focusInput() {
    // Not on touch screens, where it would pop up the keyboard.
    if (finePointer.matches && !inputLine.hidden && isActive("terminal"))
      input.focus({ preventScroll: true });
  }

  term.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const tile = target.closest<HTMLElement>("[data-photo]");
    if (tile) {
      openPhoto(tile.dataset.album ?? "", Number(tile.dataset.photo));
      return;
    }
    const link = target.closest<HTMLElement>("[data-goto]");
    if (link) {
      perform(linesFor(link.dataset.goto ?? ""));
      return;
    }
    // A click on the terminal itself, not a link or a selection, focuses
    // the prompt.
    if (!target.closest("a, button") && !getSelection()?.toString())
      focusInput();
  });

  /** The names in a folder on the nas (null: the albums folder). */
  function namesIn(folder: AlbumData | null) {
    if (!folder) return [...data.albums.map((a) => `${a.dir}/`), "flickr.url"];
    return [
      "../",
      ...(folder.link ? ["album.url"] : []),
      ...folder.photos.map((p) => p.name),
    ];
  }

  /** Tab: completes the last word, as far as the matches agree. */
  function complete() {
    const words = input.value.split(" ");
    const word = words.at(-1) ?? "";
    // The folder part of a path (cd ../tok) stays as typed.
    const base = word.slice(0, word.lastIndexOf("/") + 1);
    const partial = word.slice(base.length);
    let names: string[];
    if (words.length === 1) names = Object.keys(commands);
    else if (host === "home") names = base ? [] : homeFiles;
    else {
      const folder = base ? resolve(base) : dir ? album(dir) : null;
      names = folder === undefined ? [] : namesIn(folder ?? null);
    }
    const matches = names.filter((name) => name.startsWith(partial));
    if (matches.length === 0) return;
    let common = matches[0];
    for (const name of matches)
      while (!name.startsWith(common)) common = common.slice(0, -1);
    const done = matches.length === 1 && !common.endsWith("/");
    words[words.length - 1] = base + common + (done ? " " : "");
    input.value = words.join(" ");
  }

  input.addEventListener("keydown", (event) => {
    if (busy) return;
    if (event.key === "Enter") {
      event.preventDefault();
      const line = input.value;
      input.value = "";
      busy = true;
      run(line).finally(() => {
        busy = false;
        focusInput();
      });
    } else if (event.key === "Tab" && input.value) {
      event.preventDefault();
      complete();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      historyAt = Math.max(
        0,
        Math.min(
          history.length,
          historyAt + (event.key === "ArrowUp" ? -1 : 1),
        ),
      );
      input.value = history[historyAt] ?? "";
    } else if (event.ctrlKey && event.key === "l") {
      event.preventDefault();
      log.replaceChildren();
    } else if (
      event.ctrlKey &&
      event.key === "c" &&
      !getSelection()?.toString()
    ) {
      event.preventDefault();
      const line = document.createElement("p");
      line.className = "term-line";
      line.append(prompt(), ` ${input.value}^C`);
      log.append(line);
      input.value = "";
    }
  });

  // Typing anywhere on the page types into the prompt.
  const listening = new AbortController();
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key.length !== 1 ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        inputLine.hidden ||
        !isActive("terminal") ||
        document.activeElement === input ||
        document.querySelector("dialog[open]")
      )
        return;
      input.focus({ preventScroll: true });
    },
    { signal: listening.signal },
  );
  document.addEventListener("astro:before-swap", () => listening.abort(), {
    once: true,
  });

  /** A fresh session, each time the window opens: the notice, then `ls`. */
  async function startSession() {
    const mine = ++session;
    busy = false;
    input.readOnly = false;
    input.value = "";
    log.replaceChildren();
    [host, dir] = ["home", null];
    updatePrompt();
    inputLine.hidden = false;
    await sleep(300);
    if (mine !== session) return;
    await perform(["cat /etc/motd", "ls"]);
    if (mine === session) print("# click a name, or type help", "dim");
  }

  /** The window closed (the red light, or `exit`): the session ends. */
  function endSession() {
    session += 1;
    busy = false;
    showSeason(null);
  }

  registerApp("terminal", { start: startSession, end: endSession });

  // When Photos closes, the season goes back to the terminal's album, if it
  // is in one.
  document.addEventListener(
    "photos:closed",
    () => {
      const here = host === "nas" && dir ? album(dir) : null;
      showSeason(here?.season ?? null);
    },
    { signal: listening.signal },
  );

  // The first session starts once the boot screen is done.
  (async () => {
    if ("boot" in document.documentElement.dataset)
      await new Promise((resolve) =>
        document.addEventListener("boot:done", resolve, { once: true }),
      );
    openApp("terminal");
  })();
}
