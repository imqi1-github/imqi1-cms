export interface AudioItem {
  name?: string
  title?: string
  artist?: string
  author?: string
  cover?: string
  url?: string
  lrc?: string
  pic?: string
  type?: string
}

export interface MetingOptions {
  container?: HTMLElement
  mini?: boolean
  fixed?: boolean
  mutex?: boolean
  lrcType?: number
  preload?: string
  theme?: string
  loop?: string
  order?: string
  volume?: number
  listFolded?: boolean
  listMaxHeight?: number
  audio?: AudioItem[]
  storageName?: string
}