export interface CategoryItem {
	mid: number;
	name: string;
	slug: string | null;
	desc: string | null;
	contentCount: number;
}

export interface CsrfResponse {
	data: {
		token: string;
	};
}

export interface CategoryCreateResponse {
	success: boolean;
	data: {
		mid: number;
		name: string;
		slug: string | null;
		desc: string | null;
	};
}

export interface CategoryUpdateResponse {
	success: boolean;
	data: {
		mid: number;
		name: string;
		slug: string | null;
		desc: string | null;
	};
}

export interface CategoryDeleteResponse {
	success: boolean;
}