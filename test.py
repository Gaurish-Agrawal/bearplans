import urllib.parse
import json
from bs4 import BeautifulSoup
import requests
import math

import googlemaps
from datetime import datetime


# Sample data
classes = [
    {'days': '-T-R---', 'times': ['16:00', '17:00'], 'prof': 'Goeritz', 'building': 'Seigle   109', 'subsection': '01', 'code': 'L16 CompLitTht 351', 'timestring': '04:00PM-05:20PM', 'boxcolor': '#FFF4E5'},
    {'days': 'M-W----', 'times': ['10:00', '11:00'], 'prof': 'Medeiros Da Rosa', 'building': 'Crow   201', 'subsection': '01', 'code': 'L31 Physics 191', 'timestring': '10:00AM-11:20AM', 'boxcolor': '#F0E5FF'},
    {'days': '----F--', 'times': ['10:00'], 'prof': 'Mcclure', 'building': 'Eads', 'subsection': 'F', 'code': 'L31 Physics 191', 'timestring': '10:00AM-10:50AM', 'boxcolor': '#F0F0F0'},
    {'days': '----F--', 'times': ['10:00'], 'prof': 'Mcclure', 'building': 'Friburg', 'subsection': 'F', 'code': 'L31 Physics 191', 'timestring': '10:00AM-10:50AM', 'boxcolor': '#F0F0F0'}
]



"""
washu_class_buildings = ['Brauer Hall, Washington University', 'Cupples Hall, Washington University', 'Weil Hall, Washington University', 'Louderman Hall, Washington University', 'Brown Hall, Washington University', 'Somers Hall, Washington University', 'Duncker Hall, Washington University', 'Whitaker Hall, Washington University', 'Busch Hall, Washington University', 'Lopata Hall, Washington University', 'Music Hall, Washington University', 'Schnuck Hall, Washington University', 'Goldfarb Hall, Washington University', 'Knight Hall, Washington University', 'South Hall, Washington University', 'Steinberg Hall, Washington University', 'Becker Medical Library, St. Louis', 'West Hall, Washington University', 'Jubel Hall, St. Louis', 'Seigle Hall, Saint Louis', 'Hillman Hall, Washington University', 'Danforth University Center, Washington University', 'Academy Bldg, University City', 'Wilson Hall, Washington University', 'January Hall, St. Louis', 'Blewett Hall, Clayton', '(None) Hall, Washington University', 'Tietjens Hall, Washington University', 'Rebstock Hall, St. Louis', 'See Hall, Washington University', 'Mallinckrodt Center, St. Louis', 'North Hall, Washington University', 'Life Sciences Building, St. Louis', 'Green Hall, Washington University', 'McDonnell Hall, Washington University', 'Urbauer Hall, Washington University', 'TechArtista UCity, Univeristy City', 'Farrell Learning and Teaching Center, St. Louis', 'Rudolph Hall, Washington University', 'Eads Hall, Washington University', 'McMillan Hall, Washington University', 'Bixby Hall, Washington University', 'BJC Institute of Health, Washington University', 'Walker Hall, Washington University', 'Ridgley Hall, Washington University', 'Givens Hall, St. Louis', 'Mildred Lane Kemper Art Museum, St. Louis', 'Simon Hall, St. Louis', 'TBA Hall, Washington University', 'Ann Whitney Olin Women’s Building, Brookings Dr, St. Louis', 'Sumers Welcome Center Pavilion, St. Louis', 'Gary M. Sumers Recreation Center, St. Louis', 'Anheuser-Busch Performance Hall, Blanche M. Touhill Performing Arts Center, Washington University', 'Gephardt Institute for Civic and Community Engagement, St. Louis', 'Clinical Science Research Building, St. Louis', 'Gaylord Music Library, St. Louis', 'Crow Observatory, St. Louis', '560 Music Center, St. Louis', 'Sever Hall, St. Louis', 'Wrighton Hall, Washington University', 'Jolley Hall, St. Louis', 'Olin School of Business, St. Louis', 'Remote Hall, Washington University', 'Village Café, St. Louis', 'South 40 Fitness Center, Washington University', 'Compton Hall, Hadley Township', 'Umrath Lounge, Washington University']
"""
locs = [('Becker Medical Library, St. Louis', 'See Hall, Washington University'), ('Becker Medical Library, St. Louis', 'North Hall, Washington University'), ('Becker Medical Library, St. Louis', 'TBA Hall, Washington University'), ('Becker Medical Library, St. Louis', 'Remote Hall, Washington University'), ('Jubel Hall, St. Louis', 'See Hall, Washington University'), ('Jubel Hall, St. Louis', 'North Hall, Washington University'), ('Jubel Hall, St. Louis', 'TBA Hall, Washington University'), ('Jubel Hall, St. Louis', 'Remote Hall, Washington University'), ('Seigle Hall, Saint Louis', '(None) Hall, Washington University'), ('Seigle Hall, Saint Louis', 'See Hall, Washington University'), ('Seigle Hall, Saint Louis', 'North Hall, Washington University'), ('Seigle Hall, Saint Louis', 'TBA Hall, Washington University'), ('Seigle Hall, Saint Louis', 'Remote Hall, Washington University'), ('Hillman Hall, Washington University', 'See Hall, Washington University'), ('Hillman Hall, Washington University', 'North Hall, Washington University'), ('Hillman Hall, Washington University', 'Remote Hall, Washington University'), ('Danforth University Center, Washington University', '(None) Hall, Washington University'), ('Danforth University Center, Washington University', 'See Hall, Washington University'), ('Danforth University Center, Washington University', 'North Hall, Washington University'), ('Danforth University Center, Washington University', 'TBA Hall, Washington University'), ('Danforth University Center, Washington University', 'Remote Hall, Washington University'), ('Wilson Hall Arts & Science, Washington University', '(None) Hall, Washington University'), ('Wilson Hall Arts & Science, Washington University', 'See Hall, Washington University'), ('Wilson Hall Arts & Science, Washington University', 'North Hall, Washington University'), ('Wilson Hall Arts & Science, Washington University', 'TBA Hall, Washington University'), ('Wilson Hall Arts & Science, Washington University', 'Remote Hall, Washington University'), ('Wilson Hall, Washington University', 'Umrath Lounge, Washington University'), ('January Hall, St. Louis', '(None) Hall, Washington University'), ('January Hall, St. Louis', 'See Hall, Washington University'), ('January Hall, St. Louis', 'North Hall, Washington University'), ('January Hall, St. Louis', 'Remote Hall, Washington University'), ('Blewett Hall, Clayton', '(None) Hall, Washington University'), ('Blewett Hall, Clayton', 'See Hall, Washington University'), ('Blewett Hall, Clayton', 'North Hall, Washington University'), ('Blewett Hall, Clayton', 'TBA Hall, Washington University'), ('Blewett Hall, Clayton', 'Remote Hall, Washington University'), ('Tietjens Hall, Washington University', 'See Hall, Washington University'), ('Tietjens Hall, Washington University', 'North Hall, Washington University'), ('Tietjens Hall, Washington University', 'TBA Hall, Washington University'), ('Tietjens Hall, Washington University', 'Remote Hall, Washington University'), ('Rebstock Hall, St. Louis', 'See Hall, Washington University'), ('Rebstock Hall, St. Louis', 'North Hall, Washington University'), ('Rebstock Hall, St. Louis', 'TBA Hall, Washington University'), ('Rebstock Hall, St. Louis', 'Remote Hall, Washington University'), ('Mallinckrodt Center, St. Louis', 'North Hall, Washington University'), ('Mallinckrodt Center, St. Louis', 'Remote Hall, Washington University'), ('Green Hall, Washington University', 'TBA Hall, Washington University'), ('Green Hall, Washington University', 'Remote Hall, Washington University'), ('McDonnell Hall, Washington University', 'Remote Hall, Washington University'), ('Urbauer Hall, Washington University', 'Remote Hall, Washington University'), ('Farrell Learning and Teaching Center, St. Louis', 'TBA Hall, Washington University'), ('Farrell Learning and Teaching Center, St. Louis', 'Remote Hall, Washington University'), ('Rudolph Hall Wustl, St Louis', 'TBA Hall, Washington University'), (' Rudolph Hall Wustl, St Louis', 'Remote Hall, Washington University'), ('Eads Hall, Washington University', 'Remote Hall, Washington University'), ('McMillan Hall, Washington University', 'Remote Hall, Washington University'), ('Bixby Hall, Washington University', 'TBA Hall, Washington University'), ('Bixby Hall, Washington University', 'Remote Hall, Washington University'), ('BJC Institute of Health, Washington University', 'TBA Hall, Washington University'), ('BJC Institute of Health, Washington University', 'Remote Hall, Washington University'), ('Walker Hall, Washington University', 'TBA Hall, Washington University'), ('Walker Hall, Washington University', 'Remote Hall, Washington University'), ('Ridgley Hall, Washington University', 'TBA Hall, Washington University'), ('Ridgley Hall, Washington University', 'Remote Hall, Washington University'), ('Givens Hall, St. Louis', 'TBA Hall, Washington University'), ('Givens Hall, St. Louis', 'Remote Hall, Washington University'), ('Mildred Lane Kemper Art Museum, St. Louis', 'TBA Hall, Washington University'), ('Mildred Lane Kemper Art Museum, St. Louis', 'Remote Hall, Washington University'), ('Simon Hall, St. Louis', 'TBA Hall, Washington University'), ('Simon Hall, St. Louis', 'Remote Hall, Washington University'), ('Ann Whitney Olin Women’s Building, Brookings Dr, St. Louis', 'Remote Hall, Washington University'), ('Sumers Welcome Center Pavilion, St. Louis', 'Remote Hall, Washington University'), ('Gary M. Sumers Recreation Center, St. Louis', 'Remote Hall, Washington University'), ('Anheuser-Busch Performance Hall, Blanche M. Touhill Performing Arts Center, Washington University', 'Remote Hall, Washington University'), ('Gephardt Institute for Civic and Community Engagement, St. Louis', 'Remote Hall, Washington University'), ('Clinical Science Research Building, St. Louis', 'Remote Hall, Washington University'), ('Gaylord Music Library, St. Louis', 'Remote Hall, Washington University'), ('Crow Observatory, St. Louis', 'Remote Hall, Washington University'), ('560 Music Center, St. Louis', 'Remote Hall, Washington University')]

#gmaps = googlemaps.Client(key='AIzaSyBkuRlqOrotbgfJy45YEl51f3-cHr_SQLQ')


distances = {}
L = []

# Iterate over each pair of locations
for i in locs:
    if True:
        origin = i[0]
        destination = i[1]

        if destination != "Remote Hall":

            try:
                
                
                directions_result = gmaps.directions(
                    origin,
                    destination,
                    mode="walking",
                )
                
                if directions_result:
                    leg = directions_result[0]['legs'][0]
                    distance = leg['distance']['text']
                    duration = leg['duration']['text']
                    
                    # Store the result in the dictionary
                    distances[origin.split(",")[0].split()[0]+"-"+destination.split(",")[0].split()[0]] = {
                        'distance': distance,
                        'duration': duration
                    }
                    
                    print(f"Distance from {origin} to {destination}: {distance}")
                    print(f"Duration from {origin} to {destination}: {duration}")
                else:
                    print(f"No directions found for {origin} to {destination}.")
                    continue
            
            except Exception as e:
                L.append((origin, destination))
                continue

"""
print("\n\n\n\n")
print(L)
print("\n\n\n\n")
print(distances)


with open('walkingdist3.json', 'w', encoding='utf-8') as f:
    json.dump(distances, f, ensure_ascii=False, indent=4)
    """