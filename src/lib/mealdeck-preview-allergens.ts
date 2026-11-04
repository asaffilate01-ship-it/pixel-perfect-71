import type {MenuItem} from "./mealdeck";
import type {SampleBasketLine} from "./mealdeck-preview-basket";

/**
 * A menu preview is not a validated ingredient or cross-contact record.
 * In particular, an absent or empty allergen list NEVER means allergen-free.
 * Do not infer allergens from a name, description, cuisine, or modifier label.
 */
export type PreviewAllergenInformation={
  status:"unverified";
  headline:string;
  guidance:string;
  modifierWarning:string|null;
};
export function previewAllergenInformation(
  item:Pick<MenuItem,"allergens"|"hasModifiers"|"modifierGroups">,
  selected:SampleBasketLine["selected"]=[],
):PreviewAllergenInformation{
  const customised=Array.isArray(selected)&&selected.length>0;
  const optionsPossible=item.hasModifiers===true||
    (Array.isArray(item.modifierGroups)&&item.modifierGroups.length>0);
  return {
    status:"unverified",
    headline:"Allergen information not verified",
    guidance:"This is an illustrative menu, not an allergen declaration. If you have a food allergy or intolerance, check ingredients and cross-contact risks directly with the kitchen before ordering.",
    modifierWarning:customised
      ?"Your selected extras may change ingredients and allergens. Ask the kitchen to confirm this exact combination."
      :optionsPossible
        ?"Sizes, sauces, toppings and other extras may change ingredients and allergens."
        :null,
  };
}
export function previewDietaryDisclosure(category:string):string|null{
  if(typeof category!=="string")return null;
  return /\b(vegetarian|vegan|gluten[ -]?free|dairy[ -]?free|nut[ -]?free|halal)\b/i.test(category)
    ?"This menu category is illustrative, not an independently verified dietary or allergen suitability claim."
    :null;
}
