interface Cover {
  url: string;
  desc?: string;
  width?: number | null;
  height?: number | null;
}

export interface Props {
  covers: Cover[];
  isPhotoCategory?: boolean;
}
