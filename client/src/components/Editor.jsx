import React from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { oneDark } from "@codemirror/theme-one-dark";
import { dracula } from "@uiw/codemirror-theme-dracula";
import { githubLight } from "@uiw/codemirror-theme-github";
import { nord } from "@uiw/codemirror-theme-nord";

export default function Editor({ language, value, onChange, currentTheme }) {
  const handleChange = React.useCallback(
    (val) => onChange(val),
    [onChange]
  );

  let extensions = [];
  if (language === "html") extensions = [html()];
  if (language === "css") extensions = [css()];
  if (language === "js") extensions = [javascript()];

  // Map theme names to imports
  const themeMap = {
    oneDark,
    dracula,
    githubLight,
    nord,
  };

  return (
    <div className="flex flex-col w-full border border-gray-700 rounded-lg overflow-hidden">
      <div className="bg-gray-800 text-white p-2 text-sm font-semibold uppercase tracking-wide">
        {language}
      </div>
      <CodeMirror
        value={value}
        height="250px"
        extensions={extensions}
        theme={themeMap[currentTheme] || oneDark}
        onChange={handleChange}
        className="text-sm"
      />
    </div>
  );
}
