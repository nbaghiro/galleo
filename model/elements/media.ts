// Media-category value-sets — image / video / icon. (Media *source* kinds — photo/gif/illustration/…—
// live on the picker in @model/media, not here.)

export const IMAGE_FIT = ["cover", "contain"] as const;
export type ImageFit = (typeof IMAGE_FIT)[number];
