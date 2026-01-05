import eslintConfig from "eslint-config-next";

const config = [
  ...eslintConfig,
  {
    ignores: ["node_modules/**"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default config;
