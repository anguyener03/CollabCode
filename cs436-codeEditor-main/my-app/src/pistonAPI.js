import axios from "axios";

export const executeCode = async (sourceCode) => {
  const response = await axios.post("http://localhost:4000/api/run", {
    code: sourceCode,
  });
  // Normalize to the shape CodeEditor expects: { run: { output, stderr } }
  return {
    run: {
      output: response.data.output,
      stderr: response.data.isError ? response.data.output : "",
    },
  };
};
