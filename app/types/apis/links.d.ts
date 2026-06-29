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
	originalLink?: {
		id: number;
		name: string;
		link: string;
		avatar: string | null;
	} | null;
}