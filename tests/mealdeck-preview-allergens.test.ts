import {describe,expect,test} from "bun:test";
import {previewAllergenInformation,previewDietaryDisclosure} from "../src/lib/mealdeck-preview-allergens";
import type {MenuItem} from "../src/lib/mealdeck";

const dish:MenuItem={
  id:"example",name:"Example meal",brandId:"sample",category:"Hot meals",pricePence:500,
  hasModifiers:true,
};
describe("MealDeck sample allergen clarity",()=>{
  test("missing allergens never become a false allergen-free claim",()=>{
    const details=previewAllergenInformation(dish);
    expect(details.status).toBe("unverified");
    expect(details.headline).toContain("not verified");
    expect(details.guidance).toContain("cross-contact");
    expect(details.guidance.toLowerCase()).not.toContain("allergen-free");
  });
  test("an explicitly empty allergen array still does not verify safety",()=>{
    expect(previewAllergenInformation({...dish,allergens:[]}).status).toBe("unverified");
  });
  test("unreviewed allergen array is not treated as proof of safety",()=>{
    const result=previewAllergenInformation({...dish,allergens:["milk"]});
    expect(result.status).toBe("unverified");
    expect(result.headline).not.toContain("milk");
  });
  test("custom options prompt confirmation of the exact combination",()=>{
    expect(previewAllergenInformation(dish,[{groupId:"extras",optionId:"cheese"}]).modifierWarning)
      .toContain("exact combination");
  });
  test("optional extra choices warn before selection",()=>{
    expect(previewAllergenInformation(dish).modifierWarning).toContain("extras");
    expect(previewAllergenInformation({...dish,hasModifiers:false,modifierGroups:[]}).modifierWarning).toBeNull();
  });
  test("dietary categories explicitly disclaim independent verification",()=>{
    for(const category of ["Vegetarian","vegan","Gluten free","Nut-free","Halal"]){
      expect(previewDietaryDisclosure(category)).toContain("not an independently verified");
    }
    expect(previewDietaryDisclosure("Burgers")).toBeNull();
  });
  test("brand and product names do not produce inferred allergen results",()=>{
    const unknown=previewAllergenInformation({...dish,name:"Peanut curry with milk"});
    expect(unknown.status).toBe("unverified");
    expect(unknown.headline).toBe("Allergen information not verified");
  });
});
