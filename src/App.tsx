// App.tsx
import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { LatLngExpression, PathOptions } from 'leaflet'; // Only import types
import { Feature, Geometry, GeoJsonObject } from 'geojson'; // Import GeoJSON types
import { SearchDataResponse, createConfiguration, ServerConfiguration, ThoughtSpotRestApi } from '@thoughtspot/rest-api-sdk';
import { StyleFunction } from 'leaflet';
import { LiveboardEmbed, useEmbedRef } from '@thoughtspot/visual-embed-sdk/react';
import { AuthType, HostEvent, init, RuntimeFilterOp } from '@thoughtspot/visual-embed-sdk';

const TS_URL = "https://se-thoughtspot-cloud.thoughtspot.cloud/";
const WORKSHEET = "782b50d1-fe89-4fee-812f-b5f9eb0a552d";
const QUERY = "[Store State] [Sales]";
const LIVEBOARD = "b71ff337-725e-4211-a292-d29837b9f5c2"


interface StateSales {
  [state: string]: number;
}

const App: React.FC = () => {
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [mapData, setMapData] = useState<GeoJsonObject | null>(null);
  const [stateSales, setStateSales] = useState<StateSales>({});
  const [minSales, setMinSales] = useState<number>(0);
  const [maxSales, setMaxSales] = useState<number>(0);
  const embedRef = useEmbedRef<typeof LiveboardEmbed>();
  const ref = useRef<HTMLDivElement>(null)

  init({
    thoughtSpotHost: TS_URL,
    authType: AuthType.None,
    customizations:{
      style: {
        customCSS: {
          variables: {
            "--ts-var-root-background":"#CCCCCC33",
            "--ts-var-viz-background":"#FFFFFFAA"
          },
          rules_UNSTABLE: {
            ".embed-module__tsEmbedContainer" :{
              "background":"transparent"
            },
            ".pinboard-viz-module__vizContainer":{
              "background":"none !important"
            },
            ".pinboard-content-module__tile":{
              "background":"none !important"
            },
            ".answer-content-header-module__container":{
              "background":"none !important"
            }
          }
         
        }
      }
    }
  })

  // Fetch GeoJSON data
  useEffect(() => {
    fetch('https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json')
      .then((response) => response.json())
      .then((data) => setMapData(data));
      if (ref.current){
        ref.current.style.zIndex = '0';
      }
  }, []);
  const showLiveboard = () => {
    if (ref.current){
      ref.current.style.zIndex = '99999';
    }
    embedRef.current.trigger(HostEvent.UpdateRuntimeFilters, [
      {
        columnName: 'Store State',
        operator: RuntimeFilterOp.IN,
        values: selectedStates
      }
    ])
  }
  const hideLiveboard = () => {
    if (ref.current){
      ref.current.style.zIndex = '0';
    }  
    embedRef.current.trigger(HostEvent.UpdateRuntimeFilters, [
      {
        columnName: 'Store State',
        operator: RuntimeFilterOp.IN,
        values: []
      }
    ])
    setSelectedStates([])
  }
  // Fetch API data for coloring the map and calculate min/max sales
  useEffect(() => {
    if (mapData) {
      const client = createClientWithoutAuth(TS_URL);
      client.searchData({
        query_string: QUERY,
        logical_table_identifier: WORKSHEET,
      })
        .then((response: SearchDataResponse) => {
          const salesData: StateSales = {};
          const salesValues: number[] = [];

          // Map the data to an object where the key is the state name and value is the sales number
          response.contents[0].data_rows.forEach((row) => {
            const stateName = row[0] as string;  // State name
            const salesValue = row[1] as number; // Sales value
            salesData[stateName] = salesValue;
            salesValues.push(salesValue);
          });

          // Set sales data and calculate the min/max
          setStateSales(salesData);
          setMinSales(Math.min(...salesValues));
          setMaxSales(Math.max(...salesValues));
        })
        .catch((error) => {
          console.log('Error fetching data', error);
        });
    }
  }, [mapData]);

  // Center of the map (USA)
  const center: LatLngExpression = [37.8, -96];

  // Function to style the GeoJSON layer based on state sales
  const stateStyle: StyleFunction<{ name: string }> = (feature) => {
    const stateName = feature?.properties?.name || '';
    const salesValue = stateSales[stateName];
    let fillColor = salesValue ? interpolateColor(salesValue, minSales, maxSales) : '#3388ff'; // Default color if no sales value

    if (selectedStates.includes(stateName)){
      fillColor = "#cccccc";
    }
    // Calculate color based on sales value between minSales and maxSales

    return {
      fillColor,
      weight: 2,
      opacity: 1,
      color: 'white',
      fillOpacity: 0.7,
    };
  };

  // Function to interpolate color based on the sales value between min and max
  const interpolateColor = (value: number, min: number, max: number): string => {
    // Normalize the value to a range between 0 and 1
    const normalizedValue = (value - min) / (max - min);

    // Interpolate between yellow (#FFEDA0) and dark red (#800026)
    const red = Math.floor(128 + (255 - 128) * normalizedValue);  // Interpolating between 128 and 255 for red
    const green = Math.floor(64 + (255 - 64) * (1 - normalizedValue));  // Interpolating between 255 and 64 for green
    const blue = Math.floor(26 + (255 - 26) * (1 - normalizedValue));  // Interpolating between 255 and 26 for blue

    return `rgb(${red},${green},${blue})`; // Return RGB color
  };

  // Function to handle state selection
  const onEachState = (feature: Feature<Geometry, { name: string }>, layer: L.Layer) => {
    layer.on({
      click: () => {
        const stateName = feature.properties?.name || '';
        setSelectedStates((prevSelectedStates) => {
          if (prevSelectedStates.includes(stateName)) {
            return prevSelectedStates.filter((name) => name !== stateName);
          } else {
            return [...prevSelectedStates, stateName];
          }
        });
      },
    });
  };

  return (
    <div className="h-screen w-screen flex flex-col">
      <MapContainer center={center} zoom={4} className="h-full w-full">
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        {/* Render the GeoJSON only when data is available */}
        {mapData && (
          <GeoJSON
            data={mapData}
            style={stateStyle}  // Using the correct type for style function
            onEachFeature={onEachState}
          />
        )}
      </MapContainer>
      {selectedStates && selectedStates.length > 0 && (
      <div className='absolute flex justify-center w-full' style={{bottom:'25px', zIndex:999}}>
        <div  onClick={showLiveboard} className=' hover:cursor-pointer p-4 bg-blue-600 hover:bg-blue-700 w-96 flex justify-center rounded-lg text-white'>
          Explore More
        </div>
      </div>
      )}
      <div ref={ref} className='absolute h-screen w-2/3 h-screen flex flex-col' style={{right:0, zIndex:9999, backgroundColor:"#CCCCCC99"}}>
        <div className='flex flex-row space-x-4 m-6  p-4 rounded-lg justify-between shadow-lg bg-white items-center' style={{height:'100px'}}>
          <div className='flex w-full  flex-row item-center space-x-4'>
            <div className='p-6 h-12 text-lg bg-gray-100 font-bold rounded-lg flex justify-center items-center space-x-2'>
              {selectedStates.map((state: string)=>{
                return state
              }).join(", ")}
            </div>
            <div className='text-lg flex items-center justify-center'>Location Details</div>
          </div>
          <div onClick={hideLiveboard} className='p-6 h-10 bg-gray-100 font-bold rounded-lg flex justify-center items-center '>Close </div>

        </div>
        <div style={{height:'calc(100vh - 100px)'}}>
        <LiveboardEmbed
          ref={embedRef}
          liveboardId={LIVEBOARD}
          />
          </div>
      </div>
      
    </div>
  );
};

export default App;

export const createClientWithoutAuth = (host: string) => {
  host = host.replace("#/", "").replace("#", "");
  if (host.endsWith('/')) {
    host = host.slice(0, -1);
  }
  const config = createConfiguration({
    baseServer: new ServerConfiguration(host, {}),
  });
  const tsRestApiClient = new ThoughtSpotRestApi(config);
  return tsRestApiClient;
};
