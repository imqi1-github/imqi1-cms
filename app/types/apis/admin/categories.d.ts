export interface CategoryItem {
	mid: number;
	name: string;
	slug: string | null;
	desc: string | null;
	postCount: number;
}

export const toast = useToast();