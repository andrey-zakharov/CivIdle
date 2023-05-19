import { FunctionComponent } from "react";
import { Building } from "../definitions/BuildingDefinitions";
import { Singleton, useGameState } from "../Global";
import { GameState } from "../logic/GameState";
import { Tick } from "../logic/TickLogic";
import { ITileData } from "../logic/Tile";
import { DefaultBuildingBody } from "./DefaultBuildingBody";
import { HeadquarterBuildingBody } from "./HeadquarterBuildingBody";
import { LoadingPage } from "./LoadingPage";
import { MarketBuildingBody } from "./MarketBuildingBody";
import { MenuComponent } from "./MenuComponent";
import { StatisticsBuildingBody } from "./StatisticsBuildingBody";

const BuildingBodyOverride: Partial<Record<Building, FunctionComponent<IBuildingComponentProps>>> = {
   Headquarter: HeadquarterBuildingBody,
   Market: MarketBuildingBody,
   Statistics: StatisticsBuildingBody,
};

export function BuildingPage({ tile }: { tile: ITileData }): JSX.Element | null {
   if (tile.building == null) {
      Singleton().routeTo(LoadingPage, {});
      return null;
   }
   const building = tile.building;
   const gs = useGameState();
   const definition = Tick.current.buildings[building.type];
   const Body = BuildingBodyOverride[building.type] ?? DefaultBuildingBody;
   return (
      <div className="window">
         <div className="title-bar">
            <div className="title-bar-text">{definition.name()}</div>
         </div>
         <MenuComponent />
         <Body gameState={gs} xy={tile.xy} />
      </div>
   );
}

export interface IBuildingComponentProps {
   gameState: GameState;
   xy: string;
}
