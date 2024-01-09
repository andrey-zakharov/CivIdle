import { build } from "../Version.json";
import type { Building } from "../definitions/BuildingDefinitions";
import { BuildingSpecial } from "../definitions/BuildingDefinitions";
import type { City } from "../definitions/CityDefinitions";
import type { Resource } from "../definitions/ResourceDefinitions";
import { DepositResources } from "../definitions/ResourceDefinitions";
import type { Tech } from "../definitions/TechDefinitions";
import type { PartialTabulate } from "../definitions/TypeDefinitions";
import { forEach, isEmpty, keysOf, sizeOf } from "../utilities/Helper";
import { Config } from "./Config";
import type { GameState } from "./GameState";
import { SAVE_FILE_VERSION } from "./GameState";
import { getBuildingUnlockTech, getDepositUnlockTech, getResourceUnlockTech } from "./TechLogic";

export const MAX_OFFLINE_PRODUCTION_SEC = 60 * 60 * 4;

export const SCIENCE_VALUE = 0.5;

export function getVersion(): string {
   return `0.${SAVE_FILE_VERSION}.${build}`;
}

interface IRecipe {
   building: Building;
   input: PartialTabulate<Resource>;
   output: PartialTabulate<Resource>;
}

export function calculateTierAndPrice(gs: GameState) {
   forEach(DepositResources, (k) => {
      Config.ResourceTier[k] = 1;
      Config.ResourcePrice[k] = 1 + Config.Tech[getDepositUnlockTech(k)].column;
   });

   const allRecipes: IRecipe[] = [];

   forEach(Config.Building, (building, buildingDef) => {
      if (isEmpty(buildingDef.input)) {
         forEach(buildingDef.output, (res) => {
            if (!Config.ResourceTier[res]) {
               Config.ResourceTier[res] = 1;
            }
            if (!Config.ResourcePrice[res]) {
               const tech = getBuildingUnlockTech(building);
               if (tech) {
                  Config.ResourcePrice[res] = 1 + Config.Tech[tech].column;
               } else {
                  Config.ResourcePrice[res] = 1;
               }
            }
         });
         if (!Config.BuildingTier[building]) {
            Config.BuildingTier[building] = 1;
         }
      }
      if (!isEmpty(buildingDef.input) || !isEmpty(buildingDef.output)) {
         allRecipes.push({
            building,
            input: buildingDef.input,
            output: buildingDef.output,
         });
      }

      const tech = getBuildingUnlockTech(building);
      if (tech) {
         forEach(buildingDef.input, (res) => {
            const t = getResourceUnlockTech(res);
            if (t) {
               console.assert(
                  Config.Tech[t].column < Config.Tech[tech].column,
                  `Input: Expect Unlock(${building}=${tech},${Config.Tech[tech].column}) > Unlock(${res}=${t},${Config.Tech[t].column})`,
               );
            } else {
               console.error(
                  `Input: Expect Unlock(${building}=${tech},${Config.Tech[tech].column}) > Unlock(${res}=${t},NotFound)`,
               );
            }
         });
         forEach(buildingDef.construction, (res) => {
            const t = getResourceUnlockTech(res);
            if (t && t !== tech && Config.Tech[t].column > 0) {
               console.assert(
                  Config.Tech[t].column < Config.Tech[tech].column,
                  `Construction: Expect Unlock(${building}=${tech},${Config.Tech[tech].column}) > Unlock(${res}=${t},${Config.Tech[t].column})`,
               );
            }
         });
      } else {
         if (
            buildingDef.special !== BuildingSpecial.HQ &&
            buildingDef.special !== BuildingSpecial.NaturalWonder
         ) {
            console.error(`Building: ${building} is not unlocked by any tech!`);
         }
      }

      let key: Tech;
      const result: Tech[] = [];
      for (key in Config.Tech) {
         if (Config.Tech[key].unlockBuilding?.includes(building)) {
            result.push(key);
         }
      }
      console.assert(
         result.length <= 1,
         `Building ${building} should only be unlocked by one tech (${result.join(",")})`,
      );
   });

   forEach(Config.Tech, (tech, techDef) => {
      techDef.unlockBuilding?.forEach((b) => {
         const techLevel = techDef.column + 1;
         Config.BuildingTech[b] = techLevel;
         forEach(Config.Building[b].output, (res) => {
            if (Config.ResourceTech[res] && Config.ResourceTech[res]! > techLevel) {
               return;
            }
            Config.ResourceTech[res] = techLevel;
         });
         forEach(Config.City, (city, def) => {
            if (def.uniqueBuildings[b]) {
               console.error(`${city}'s unique building ${b} should not be unlocked by ${tech}`);
            }
         });
         console.assert(
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            !isEmpty(Config.Building[b].input) || !isEmpty(Config.Building[b].construction),
            `${b}: A building should have either 'input' or 'construction' defined`,
         );
      });
   });

   const resourceTierDependency: Partial<Record<Resource, Resource>> = {};
   const buildingTierDependency: Partial<Record<Building, Resource>> = {};

   while (sizeOf(Config.BuildingTier) < sizeOf(Config.Building)) {
      allRecipes.forEach(({ building, input, output }) => {
         let maxInputResourceTier = 0;
         let inputResourcesValue = 0;
         let maxInputResource: Resource | null = null;
         const allInputResourcesHasTier = keysOf(input).every((r) => {
            const tier = Config.ResourceTier[r];
            const price = Config.ResourcePrice[r];
            if (tier && tier > maxInputResourceTier) {
               maxInputResourceTier = tier;
               maxInputResource = r;
            }
            if (price) {
               inputResourcesValue += price * (input[r] ?? 0);
            }
            return tier && price;
         });
         if (allInputResourcesHasTier) {
            const targetTier = maxInputResourceTier + 1;
            let allOutputAmount = 0;
            let notPricedResourceValue = 0;
            forEach(output, (res, amount) => {
               if (res === "Science") {
                  // Science is internally valued at 0.5
                  notPricedResourceValue += amount * SCIENCE_VALUE;
                  return;
               }
               if (!Config.ResourceTier[res] || targetTier < Config.ResourceTier[res]!) {
                  const oldTier = Config.ResourceTier[res];
                  Config.ResourceTier[res] = targetTier;
                  if (maxInputResource) {
                     resourceTierDependency[res] = maxInputResource;
                  }
                  forEach(resourceTierDependency, (k, v) => {
                     if (v === res) {
                        delete resourceTierDependency[k];
                        delete Config.ResourceTier[k];
                        console.log(
                           `Resource Tier of ${k} is decided by ${res}, but its tier has changed from ${
                              oldTier ?? "?"
                           } to ${targetTier}`,
                        );
                     }
                  });
                  forEach(buildingTierDependency, (k, v) => {
                     if (v === res) {
                        delete buildingTierDependency[k];
                        delete Config.BuildingTier[k];
                        console.log(
                           `Building Tier of ${k} is decided by ${res}, but its tier has changed from ${
                              oldTier ?? "?"
                           } to ${targetTier}`,
                        );
                     }
                  });
               }
               allOutputAmount += amount;
            });
            if (!Config.BuildingTier[building] || targetTier > Config.BuildingTier[building]!) {
               Config.BuildingTier[building] = targetTier;
            }
            forEach(output, (res) => {
               const price = (2 * inputResourcesValue - notPricedResourceValue) / allOutputAmount;
               if (!Config.ResourcePrice[res] || price > Config.ResourcePrice[res]!) {
                  Config.ResourcePrice[res] = price;
               }
            });
         }
      });
   }

   const endResources: Resource[] = [];

   forEach(Config.Resource, (r) => {
      if (Config.Resource[r].canPrice) {
         console.assert(Config.ResourceTier[r], `Resource = ${r} does not have a tier`);
         console.assert(Config.ResourcePrice[r], `Resource = ${r} does not have a price`);
      } else {
         Config.ResourcePrice[r] = 1;
         Config.ResourceTier[r] = 1;
      }

      let isEndResource = true;
      forEach(Config.Building, (b, def) => {
         if (def.input[r]) {
            isEndResource = false;
         }
      });
      if (isEndResource) {
         endResources.push(r);
      }
   });

   const uniqueBuildings: Partial<Record<Building, City>> = {};

   forEach(Config.City, (city, def) => {
      forEach(def.uniqueBuildings, (k, v) => {
         if (uniqueBuildings[k]) {
            console.error(`Duplicated unique buildings ${k} found in ${uniqueBuildings[k]} and ${city}`);
            return;
         }
         uniqueBuildings[k] = city;
      });
   });

   console.log("AllRecipes", allRecipes);
   console.log("BuildingTier", sortTabulate(Config.BuildingTier));
   console.log("BuildingTech", sortTabulate(Config.BuildingTech));
   console.log("ResourceTier", sortTabulate(Config.ResourceTier));
   console.log("ResourcePrice", sortTabulate(Config.ResourcePrice));
   console.log("ResourceTech", sortTabulate(Config.ResourceTech));
   console.log(
      "EndResources",
      endResources
         .filter((r) => Config.Resource[r].canPrice && Config.Resource[r].canStore)
         .map((r) => ({
            Resource: r,
            Tier: Config.ResourceTier[r],
            Price: Config.ResourcePrice[r],
         })),
   );
}

function sortTabulate<T extends string>(dict: PartialTabulate<T>): string[] {
   return keysOf(dict)
      .sort((a, b) => dict[a]! - dict[b]!)
      .map((a) => {
         return `${a}: ${dict[a]}`;
      });
}
