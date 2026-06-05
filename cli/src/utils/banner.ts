import pc from "picocolors";

const PAPERCLIP_ART = [
  "██████╗  █████╗ ██████╗ ███████╗██████╗  ██████╗██╗     ██╗██████╗ ",
  "██╔══██╗██╔══██╗██╔══██╗██╔════╝██╔══██╗██╔════╝██║     ██║██╔══██╗",
  "██████╔╝███████║██████╔╝█████╗  ██████╔╝██║     ██║     ██║██████╔╝",
  "██╔═══╝ ██╔══██║██╔═══╝ ██╔══╝  ██╔══██╗██║     ██║     ██║██╔═══╝ ",
  "██║     ██║  ██║██║     ███████╗██║  ██║╚██████╗███████╗██║██║     ",
  "╚═╝     ╚═╝  ╚═╝╚═╝     ╚══════╝╚═╝  ╚═╝ ╚═════╝╚══════╝╚═╝╚═╝     ",
] as const;

const TAGLINE = "The app people use to manage AI agents for work";

function shouldPrintPaperclipCliBanner(): boolean {
  if (process.env.PAPERCLIP_NO_CLI_BANNER === "1") {
    return false;
  }

  if (process.env.VITEST === "true") {
    return false;
  }

  if (process.argv.some((arg) => arg.toLowerCase().includes("vitest"))) {
    return false;
  }

  return true;
}

export function printPaperclipCliBanner(): void {
  if (!shouldPrintPaperclipCliBanner()) {
    return;
  }

  const lines = [
    "",
    ...PAPERCLIP_ART.map((line) => pc.cyan(line)),
    pc.blue("  ───────────────────────────────────────────────────────"),
    pc.bold(pc.white(`  ${TAGLINE}`)),
    "",
  ];

  console.log(lines.join("\n"));
}
