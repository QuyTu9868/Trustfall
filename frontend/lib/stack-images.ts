import "server-only";
import { Jimp } from "jimp";

/**
 * Two photographs into one, stacked top to bottom, and made small.
 *
 * Two separate measurements that look contradictory until you notice they measure
 * different things. The tokens a model actually charges do not vary with resolution: the
 * same picture at 1187px and at 224px came back with identical usage. But the number the
 * provider checks against the per minute limit before running anything is an estimate
 * built from the size of the payload, and that does scale. So the pixels are worth cutting
 * even though the tokens are not.
 *
 * A model charges per image, not per pixel: the same picture at 1187px and at 224px cost
 * exactly the same number of tokens, measured. So two photographs sent as one cost half
 * as much and the model still sees both, which is the difference between a dispute that
 * can be judged on the free tier and one that cannot.
 *
 * That was not a nicety. A two photo dispute needed more room to think than the plan had
 * left after paying for the photographs: 2688 was refused as too large at 8039 against a
 * limit of 8000, and 2560 fitted but left the model with nothing to answer with. The
 * window was empty. This opens roughly 1800 tokens of it.
 *
 * Done on the server, never in the browser. A composite the client assembles is a
 * composite the client chooses, and the whole point is that the arbitrator sees what was
 * actually filed.
 */
const WIDTH = 640;

/** A line between them, so the model does not read one photo as the top of the other. */
const DIVIDER = 6;

export async function stackImages(dataUrls: string[]): Promise<string[]> {
  // Nothing to gain from stacking one, and the label in the prompt would then be wrong.
  if (dataUrls.length < 2) return dataUrls;

  try {
    const images = await Promise.all(
      dataUrls.map(async (url) => {
        const image = await Jimp.read(Buffer.from(url.split(",")[1], "base64"));
        // Same width, so the join reads as one column rather than a collage.
        return image.resize({ w: WIDTH });
      })
    );

    const height =
      images.reduce((total, image) => total + image.height, 0) +
      DIVIDER * (images.length - 1);

    const sheet = new Jimp({ width: WIDTH, height, color: 0x000000ff });
    let y = 0;
    for (const image of images) {
      sheet.composite(image, 0, y);
      y += image.height + DIVIDER;
    }

    // Small and lossy on purpose. What this has to answer is whether something is
    // scratched, missing or broken, and none of that needs a magazine print.
    const jpeg = await sheet.getBuffer("image/jpeg", { quality: 70 });
    return [`data:image/jpeg;base64,${jpeg.toString("base64")}`];
  } catch (error) {
    // Falling back to sending them separately is right: the arbitration may then be
    // refused for size, which is recoverable and visible, where quietly judging on one
    // photograph would not be.
    console.error("Could not stack the evidence photos:", error);
    return dataUrls;
  }
}
