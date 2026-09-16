const fs = require("fs");
const ts = require("typescript");

const file = process.argv[2];
const source = fs.readFileSync(file, "utf-8");
const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);

function visit(node) {
	if (ts.isStringLiteral(node) && node.text.includes("The participant must be present")) {
		console.log("node.getStart:", node.getStart(), "node.getEnd:", node.getEnd());
		console.log("text slice:", JSON.stringify(source.slice(node.getStart(), node.getEnd())));
		console.log("node.text:", node.text);
	}
	ts.forEachChild(node, visit);
}
visit(sourceFile);
