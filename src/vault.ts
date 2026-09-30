// File System Access API wrapper for opening and editing a local vault of
// .tmt files directly -- no server, no upload. The browser owns the
// permission model; this module just wraps the calls and adds a thin
// IndexedDB layer so the picked folder survives a reload without asking
// again (the browser still requires re-granting permission each session,
// that part can't be skipped).

import type { TreeNodeData } from "@shion/ui";

export function isFileSystemAccessSupported(): boolean {
	return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function pickVaultDirectory(): Promise<FileSystemDirectoryHandle> {
	return await (window as any).showDirectoryPicker({
		id: "tomet-vault",
		mode: "readwrite",
	});
}

export async function verifyReadWritePermission(
	handle: FileSystemDirectoryHandle,
): Promise<boolean> {
	const opts = { mode: "readwrite" as const };
	if ((await (handle as any).queryPermission(opts)) === "granted") return true;
	return (await (handle as any).requestPermission(opts)) === "granted";
}

// Directories that never hold notes worth showing, so the tree doesn't
// fill up with tooling noise.
const IGNORED_DIR_NAMES = new Set([
	".git",
	"node_modules",
	".obsidian",
	"dist",
	".jj",
]);

export async function buildVaultTree(
	dirHandle: FileSystemDirectoryHandle,
	parentPath = "",
): Promise<TreeNodeData[]> {
	const entries: {
		name: string;
		handle: FileSystemDirectoryHandle | FileSystemFileHandle;
	}[] = [];
	for await (const [name, handle] of (dirHandle as any).entries()) {
		entries.push({ name, handle });
	}
	entries.sort((a, b) => a.name.localeCompare(b.name));

	const nodes: TreeNodeData[] = [];
	for (const { name, handle } of entries) {
		const path = parentPath ? `${parentPath}/${name}` : name;
		if (handle.kind === "directory") {
			if (IGNORED_DIR_NAMES.has(name) || name.startsWith(".")) continue;
			const children = await buildVaultTree(
				handle as FileSystemDirectoryHandle,
				path,
			);
			if (children.length === 0) continue; // an empty subtree isn't worth a row
			nodes.push({ id: path, label: name, children, meta: { kind: "dir" } });
		} else if (name.endsWith(".tmt")) {
			nodes.push({ id: path, label: name, meta: { kind: "file", handle } });
		}
	}
	return nodes;
}

export async function readVaultFile(
	handle: FileSystemFileHandle,
): Promise<string> {
	const file = await handle.getFile();
	return await file.text();
}

export async function writeVaultFile(
	handle: FileSystemFileHandle,
	content: string,
): Promise<void> {
	const writable = await (handle as any).createWritable();
	await writable.write(content);
	await writable.close();
}

// --- IndexedDB persistence for the picked directory handle ---

const DB_NAME = "tomet-web-editor";
const STORE_NAME = "vault";
const HANDLE_KEY = "directoryHandle";

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => {
			req.result.createObjectStore(STORE_NAME);
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export async function saveVaultHandle(
	handle: FileSystemDirectoryHandle,
): Promise<void> {
	const db = await openDb();
	await new Promise<void>((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readwrite");
		tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
	db.close();
}

export async function loadVaultHandle(): Promise<FileSystemDirectoryHandle | null> {
	try {
		const db = await openDb();
		const handle = await new Promise<FileSystemDirectoryHandle | null>(
			(resolve, reject) => {
				const tx = db.transaction(STORE_NAME, "readonly");
				const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
				req.onsuccess = () => resolve(req.result ?? null);
				req.onerror = () => reject(req.error);
			},
		);
		db.close();
		return handle;
	} catch {
		return null;
	}
}
