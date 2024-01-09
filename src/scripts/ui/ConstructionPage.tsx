import { notifyGameStateUpdate, useGameState } from "../Global";
import { Config } from "../logic/Config";
import {
   PRIORITY_MAX,
   PRIORITY_MIN,
   getConstructionPriority,
   setConstructionPriority,
   type ITileData,
} from "../logic/Tile";
import { WorldScene } from "../scenes/WorldScene";
import { Singleton } from "../utilities/Singleton";
import { L, t } from "../utilities/i18n";
import { BuildingConstructionProgressComponent } from "./BuildingConstructionProgressComponent";
import { MenuComponent } from "./MenuComponent";

export function ConstructionPage({ tile }: { tile: ITileData }): React.ReactNode {
   if (tile.building == null) {
      return null;
   }
   const building = tile.building;
   const gs = useGameState();
   const definition = Config.Building[building.type];
   return (
      <div className="window">
         <div className="title-bar">
            <div className="title-bar-text">{definition.name()}</div>
         </div>
         <MenuComponent />
         <div className="window-body">
            <BuildingConstructionProgressComponent xy={tile.xy} gameState={gs} />
            <fieldset>
               <legend>
                  {t(L.ConstructionPriority)}: {getConstructionPriority(building.priority)}
               </legend>
               <input
                  type="range"
                  min={PRIORITY_MIN}
                  max={PRIORITY_MAX}
                  step="1"
                  value={getConstructionPriority(building.priority)}
                  onChange={(e) => {
                     building.priority = setConstructionPriority(
                        building.priority,
                        parseInt(e.target.value, 10),
                     );
                     notifyGameStateUpdate();
                  }}
               />
               <div className="sep15"></div>
               <div className="text-desc text-small">{t(L.ProductionPriorityDesc)}</div>
            </fieldset>
            <fieldset>
               <div className="row">
                  <button
                     className="f1"
                     onClick={() => {
                        building.status = building.status === "paused" ? "building" : "paused";
                        notifyGameStateUpdate();
                     }}
                  >
                     {t(building.status === "paused" ? L.ResumeConstructionResume : L.PauseConstructionPause)}
                  </button>
                  <button
                     className="f1"
                     onClick={() => {
                        delete tile.building;
                        Singleton().sceneManager.getCurrent(WorldScene)?.resetTile(tile.xy);
                        notifyGameStateUpdate();
                     }}
                  >
                     {t(L.EndConstructionEnd)}
                  </button>
               </div>
               <div className="sep5"></div>
               <div className="text-desc text-small">{t(L.EndConstructionDesc)}</div>
            </fieldset>
         </div>
      </div>
   );
}
