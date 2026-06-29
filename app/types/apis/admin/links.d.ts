// Link from /api/admin/links
export interface OriginalLink {
	id: number;
	name: string;
	link: string;
	avatar: string | null;
}

export interface LinkItem {
	id: number;
	name: string;
	desc: string | null;
	link: string;
	avatar: string | null;
	enabled: boolean;
	originalLinkId: number | null;
	isModification: boolean;
	modificationStatus: string | null;
	originalLink: OriginalLink | null;
}