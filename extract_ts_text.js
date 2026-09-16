const ts = require("typescript");
const fs = require("fs");

const filePath = process.argv[2];
if (!filePath) {
	console.error("Usage: node extract_ts_text.js <file>");
	process.exit(1);
}
const sourceText = fs.readFileSync(filePath, "utf-8");
const sourceFile = ts.createSourceFile(
	filePath,
	sourceText,
	ts.ScriptTarget.Latest,
	true,
	ts.ScriptKind.TSX,
);

const results = [];
const stack = [];

function decodeEntities(s) {
	return s
		.replace(/&apos;/g, "'")
		.replace(/&#39;/g, "'")
		.replace(/&ldquo;/g, '"')
		.replace(/&rdquo;/g, '"')
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&nbsp;/g, " ");
}

function isSkippableParent(node) {
	const parent = node.parent;
	if (!parent) return false;
	return (
		ts.isJsxAttribute(parent) ||
		ts.isImportDeclaration(parent) ||
		ts.isCaseClause(parent) ||
		ts.isDefaultClause(parent)
	);
}

function isJsxContentExpression(node) {
	if (!ts.isJsxExpression(node)) return false;
	const parent = node.parent;
	if (!parent) return false;
	return ts.isJsxElement(parent) || ts.isJsxFragment(parent);
}

function visit(node) {
	if (ts.isPropertyAssignment(node)) {
		let key;
		if (ts.isIdentifier(node.name)) key = node.name.text;
		else if (ts.isStringLiteral(node.name)) key = node.name.text;
		else if (ts.isNumericLiteral(node.name)) key = node.name.text;
		if (key) {
			stack.push(key);
			ts.forEachChild(node, visit);
			stack.pop();
			return;
		}
	}
	if (ts.isShorthandPropertyAssignment(node)) {
		stack.push(node.name.text);
		ts.forEachChild(node, visit);
		stack.pop();
		return;
	}

	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
		if (isSkippableParent(node)) {
			// skip className, imports, switch case labels
			return;
		}
		const pos = node.getStart();
		const end = node.getEnd();
		const startLine = sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
		const endLine = sourceFile.getLineAndCharacterOfPosition(end).line + 1;
		results.push({
			kind: "string",
			value: node.text,
			raw: node.getText(sourceFile),
			start: pos,
			end: end,
			startLine,
			endLine,
			path: [...stack],
		});
		return;
	}

	if (ts.isTemplateExpression(node)) {
		if (isSkippableParent(node)) return;
		const pos = node.getStart();
		const end = node.getEnd();
		const startLine = sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
		const endLine = sourceFile.getLineAndCharacterOfPosition(end).line + 1;
		const raw = node.getText(sourceFile);
		let text = decodeEntities(node.head.text).replace(/\s+/g, " ");
		for (const span of node.templateSpans) {
			const expr = span.expression.getText(sourceFile);
			text += "${" + expr + "}";
			const lit = decodeEntities(span.literal.text).replace(/\s+/g, " ");
			text += lit;
		}
		results.push({
			kind: "template",
			value: text,
			raw,
			start: pos,
			end: end,
			startLine,
			endLine,
			path: [...stack],
		});
		return;
	}

	if (ts.isJsxText(node)) {
		const pos = node.getStart();
		const end = node.getEnd();
		const startLine = sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
		const endLine = sourceFile.getLineAndCharacterOfPosition(end).line + 1;
		const raw = node.getText(sourceFile);
		const text = decodeEntities(raw).replace(/\s+/g, " ");
		results.push({
			kind: "jsxText",
			value: text,
			raw,
			start: pos,
			end: end,
			startLine,
			endLine,
			path: [...stack],
		});
		return;
	}

	if (isJsxContentExpression(node)) {
		const expr = node.expression;
		// Skip empty JSX expression (comments like {/* ... */})
		if (!expr) {
			ts.forEachChild(node, visit);
			return;
		}
		const pos = node.getStart();
		const end = node.getEnd();
		const startLine = sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
		const endLine = sourceFile.getLineAndCharacterOfPosition(end).line + 1;
		const fullText = node.getText(sourceFile).trim();
		let value;
		let raw;
		if (fullText === "{' '}" || fullText === '{" "}') {
			value = " ";
			raw = fullText;
		} else {
			const inner = expr.getText(sourceFile);
			value = "${" + inner + "}";
			raw = inner;
		}
		results.push({
			kind: "jsxExpr",
			value,
			raw,
			start: pos,
			end: end,
			startLine,
			endLine,
			path: [...stack],
		});
		return;
	}

	ts.forEachChild(node, visit);
}

visit(sourceFile);
console.log(JSON.stringify(results, null, 2));
