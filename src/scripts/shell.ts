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

/** As in the Mac's "Last login" line: Thu Nov 20 00:12:31 */
function loginTime(when: Date) {
  const [weekday, month, day] = when.toDateString().split(" ");
  return `${weekday} ${month} ${day} ${when.toTimeString().slice(0, 8)}`;
}

/** Storage can be switched off (or throw), so reads and writes may fail. */
type Kept = "sessionStorage" | "localStorage";

function stored(storage: Kept, key: string) {
  try {
    return window[storage].getItem(key);
  } catch {
    return null;
  }
}

function store(storage: Kept, key: string, value: string) {
  try {
    window[storage].setItem(key, value);
  } catch {
    // Without storage it is simply forgotten.
  }
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
  // History lasts for the visit, across sessions and `reboot`.
  const history: string[] = (() => {
    try {
      const saved = JSON.parse(stored("sessionStorage", "history") ?? "[]");
      return Array.isArray(saved) ? saved.map(String) : [];
    } catch {
      return [];
    }
  })();
  let historyAt = history.length;
  function remember(line: string) {
    if (!line || line === history.at(-1)) return;
    history.push(line);
    history.splice(0, history.length - 500);
    store("sessionStorage", "history", JSON.stringify(history));
  }
  // Where `cd -` goes back to: where the visitor was before the last cd.
  let oldpwd: { host: "home" | "nas"; dir: string | null } | null = null;

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

  /** A line of output ending in a link that opens in a new tab. */
  function printLink(before: string, href: string, text = href) {
    const line = document.createElement("p");
    line.className = "term-out";
    const link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = text;
    line.append(before, link);
    print(line);
  }

  /** Opens a link in a new tab. */
  function visit(url: string) {
    window.open(url, "_blank", "noopener");
    return true;
  }

  /** Leaves the nas for the home folder. */
  async function logout() {
    print("Connection to nas.local closed.", "dim");
    [host, dir] = ["home", null];
    await showSeason(null);
    return true;
  }

  /** cd without the `-`: moves and reports errors; true if it got there. */
  async function changeDir(target: string): Promise<boolean> {
    if (host === "home") {
      // Absolute paths to the home folder, or to the share it mounts.
      const name = target
        .replace(/\/$/, "")
        .replace(/^\/home\/guest(?=\/|$)/, "~")
        .replace(/^\/volume1\/photos(?=\/|$)/, "photos")
        .replace(/^(~|\.)\//, "");
      if (name === "~" || name === "." || name === "") return true;
      // photos/ is a network share: going in logs in to the nas first.
      const [first, ...rest] = name.split("/");
      if (first === "photos") {
        if (!(await commands.ssh(["nas"]))) return false;
        return rest.length ? changeDir(rest.join("/")) : true;
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
  }

  const commands: Record<string, Command> = {
    help() {
      [
        "ls            list this folder",
        "cd <folder>   go into a folder (cd .. goes up, cd - goes back)",
        "open <file>   open a photo, the resume or a link",
        "cat <file>    print a file",
        "ssh nas       log in to the photo share (cd photos does too)",
        "exit          log out of the nas, or close the terminal",
        "history       what you have typed (!! runs the last line again)",
        "clear         clear the screen",
        "reboot        restart",
      ].forEach((line) => print(line));
      print(
        "Or just click a name. Tab completes (twice lists), ↑ ↓ and Ctrl+R search history, Ctrl+D logs out.",
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
      const before = { host, dir };
      let ok: boolean;
      if (target === "-") {
        // Back to where the last cd came from, printing it, as bash does.
        if (!oldpwd) {
          print("cd: OLDPWD not set", "err");
          return false;
        }
        const back = oldpwd;
        if (back.host === "home") ok = host === "home" || (await logout());
        else if (host === "home")
          ok = await changeDir(back.dir ? `photos/${back.dir}` : "photos");
        else ok = await changeDir(back.dir ? `~/${back.dir}` : "~");
        if (ok) print(path());
      } else ok = await changeDir(target);
      if (ok && (host !== before.host || dir !== before.dir)) oldpwd = before;
      return ok;
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
      return logout();
    },

    history(args) {
      if (args[0] === "-c") {
        history.length = 0;
        historyAt = 0;
        store("sessionStorage", "history", "[]");
        return true;
      }
      const width = String(history.length).length;
      history.forEach((line, i) =>
        print(`${String(i + 1).padStart(width + 2)}  ${line}`),
      );
      return true;
    },

    async open(args) {
      const target = args[0];
      if (!target) {
        print("usage: open <file>", "err");
        return false;
      }
      // The resume opens in the PDF viewer from anywhere, the nas included.
      if (/^((~|\/home\/guest)\/)?resume(\.pdf)?$/.test(target)) {
        openApp("resume");
        return true;
      }
      if (host === "home") {
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
      // A .url file is an internet shortcut; its address is the link.
      if (host === "home" && target === "github.url") {
        print("[InternetShortcut]");
        printLink("URL=", data.github);
        return true;
      }
      // A pdf is binary, so cat shows its header and a link to open it.
      if (host === "home" && target === "resume.pdf") {
        print("%PDF-1.7", "dim");
        const line = document.createElement("p");
        line.className = "term-out";
        const link = document.createElement("a");
        link.href = data.resume;
        link.dataset.goto = "open-resume";
        link.textContent = "open resume.pdf";
        line.append("cat: resume.pdf: binary file. Try: ", link);
        print(line);
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

  /**
   * Bash's history expansion: !! is the last line, !n line n, !-n the nth
   * from the end, !text the latest line starting with text. Null (and an
   * error) if one is not there.
   */
  function expand(line: string): string | null {
    let missing: string | null = null;
    const expanded = line.replace(
      /!(!|-?\d+|[^\s!=&;|()"']+)/g,
      (event, key: string) => {
        let found: string | undefined;
        if (key === "!") found = history.at(-1);
        else if (/^-\d+$/.test(key)) found = history.at(Number(key));
        else if (/^\d+$/.test(key)) found = history[Number(key) - 1];
        else found = history.findLast((h) => h.startsWith(key));
        if (found === undefined) missing ??= event;
        return found ?? event;
      },
    );
    if (missing) {
      print(`bash: ${missing}: event not found`, "err");
      return null;
    }
    // Bash prints the line it is about to run.
    if (expanded !== line) print(expanded);
    return expanded;
  }

  /**
   * Runs one line (commands joined with && run until one fails). `shown` is
   * what appears after the prompt, if not the line itself (Ctrl+D shows
   * nothing); only lines shown as typed go into the history.
   */
  async function run(typed: string, shown = typed) {
    const mine = session;
    const block = document.createElement("div");
    block.className = "term-block";
    const echo = document.createElement("p");
    echo.className = "term-line";
    echo.append(prompt(), shown ? ` ${shown}` : "");
    block.append(echo);
    log.append(block);
    out = block;
    const line = shown === typed ? expand(typed) : typed;
    if (line !== null && shown === typed) remember(line.trim());
    historyAt = history.length;
    if (line === null) {
      updatePrompt();
      reveal(block);
      return;
    }

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
    if (goto === "resume") return ["open resume.pdf"];
    if (goto === "open-resume") return ["open resume.pdf"];
    if (goto === "github") return ["cat github.url"];
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
      // Some names are real links too, for when there is no JavaScript.
      event.preventDefault();
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

  /**
   * Tab: completes the last word, as far as the matches agree, and returns
   * the matches.
   */
  function complete(): string[] {
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
    if (matches.length === 0) return matches;
    let common = matches[0];
    for (const name of matches)
      while (!name.startsWith(common)) common = common.slice(0, -1);
    const done = matches.length === 1 && !common.endsWith("/");
    words[words.length - 1] = base + common + (done ? " " : "");
    input.value = words.join(" ");
    return matches;
  }

  /** A line in the log as the prompt showed it (for ^C and Tab lists). */
  function echoLine(text: string) {
    const line = document.createElement("p");
    line.className = "term-line";
    line.append(prompt(), text ? ` ${text}` : "");
    log.append(line);
  }

  function submit(typed: string, shown = typed) {
    input.value = "";
    busy = true;
    run(typed, shown).finally(() => {
      busy = false;
      focusInput();
    });
  }

  // A second Tab that completes nothing more lists the choices, as in bash.
  let tabbed = false;

  // Ctrl+R: the reverse history search. While it is on, typing goes into
  // the query and the input shows the latest line that contains it.
  let search: { query: string; at: number; before: string } | null = null;

  function showSearch() {
    if (!search) return;
    const failed = search.query && search.at < 0;
    const label = document.createElement("span");
    label.textContent = `(${failed ? "failed " : ""}reverse-i-search)\`${search.query}': `;
    promptSlot.replaceChildren(label);
    if (search.at >= 0) input.value = history[search.at];
  }

  /** The newest line at or before `from` containing the query, or -1. */
  function findBack(query: string, from: number) {
    for (let i = Math.min(from, history.length - 1); i >= 0; i--)
      if (history[i].includes(query)) return i;
    return -1;
  }

  /** Ends the search, keeping the line found (or the one from before). */
  function endSearch(keep: boolean) {
    if (!search) return;
    if (!keep) input.value = search.before;
    // ↑ then goes on from the line found.
    else if (search.at >= 0) historyAt = search.at;
    search = null;
    updatePrompt();
  }

  /** Handles a key while searching; false lets the usual handling go on. */
  function searchKey(event: KeyboardEvent) {
    if (!search) return false;
    if (event.ctrlKey && event.key === "r") {
      const older = findBack(search.query, search.at - 1);
      if (older >= 0) search.at = older;
    } else if (event.ctrlKey && (event.key === "g" || event.key === "c")) {
      endSearch(false);
    } else if (event.key === "Enter") {
      endSearch(true);
      return false;
    } else if (event.key === "Backspace") {
      search.query = search.query.slice(0, -1);
      search.at = search.query
        ? findBack(search.query, history.length - 1)
        : -1;
    } else if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      search.query += event.key;
      const from = search.at >= 0 ? search.at : history.length - 1;
      search.at = findBack(search.query, from);
    } else if (["Shift", "Control", "Alt", "Meta"].includes(event.key)) {
      return true;
    } else {
      // Any other key (Esc, arrows, Tab) keeps the line to edit.
      endSearch(true);
      if (event.key === "Escape") event.preventDefault();
      return event.key === "Escape";
    }
    event.preventDefault();
    showSearch();
    return true;
  }

  input.addEventListener("keydown", (event) => {
    if (busy) return;
    if (searchKey(event)) return;
    if (event.key !== "Tab") tabbed = false;
    if (event.key === "Enter") {
      event.preventDefault();
      submit(input.value);
    } else if (event.key === "Tab" && input.value) {
      event.preventDefault();
      const before = input.value;
      const matches = complete();
      if (matches.length < 2 || input.value !== before) return;
      if (!tabbed) {
        tabbed = true;
        return;
      }
      echoLine(input.value);
      out = log;
      print(matches.join("  "));
      inputLine.scrollIntoView({ block: "nearest" });
    } else if (event.ctrlKey && event.key === "r") {
      event.preventDefault();
      search = { query: "", at: -1, before: input.value };
      input.value = "";
      showSearch();
    } else if (event.ctrlKey && event.key === "d") {
      // On an empty line, end of input: log out, as bash and zsh do.
      if (input.value) return;
      event.preventDefault();
      submit("exit", "");
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
      echoLine(`${input.value}^C`);
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
    oldpwd = null;
    search = null;
    tabbed = false;
    historyAt = history.length;
    updatePrompt();
    // The time of the visitor's last session, as a Mac terminal shows it
    // (the first time ever, this one), on a new tty each session.
    const last = Number(stored("localStorage", "lastLogin")) || Date.now();
    store("localStorage", "lastLogin", String(Date.now()));
    out = log;
    print(
      `Last login: ${loginTime(new Date(last))} on ttys${String(mine - 1).padStart(3, "0")}`,
    );
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
