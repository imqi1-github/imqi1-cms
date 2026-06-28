interface Cover {
  url: string;
  desc?: string;
}

export interface Props {
  covers: Cover[];
  isPhotoCategory?: boolean;
}