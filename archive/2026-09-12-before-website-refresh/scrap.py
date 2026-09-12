from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys
from lxml import etree
from bs4 import BeautifulSoup
import json
from datetime import datetime

def convert_to_military_time(time_range):
    # Replace shorthand with full "AM" or "PM"
    time_range = time_range.replace("A", "AM").replace("P", "PM")
    
    # Split the string into start and end times
    start_time, end_time = time_range.split('-')
    
    # Convert the start and end times to 24-hour format
    start_time_24h = datetime.strptime(start_time, "%I:%M%p").strftime("%H:%M")
    end_time_24h = datetime.strptime(end_time, "%I:%M%p").strftime("%H:%M")
    
    return [start_time_24h, end_time_24h]



jsonList = {}

def automate_webpage(url,index,school):

    driver = webdriver.Chrome()  # Make sure ChromeDriver is in your PATH

    wait = 100000
    
    try:
        # Open the specified URL
        driver.get(url)

        for schoolNumber in range(school,school+1):

            try:

                button = WebDriverWait(driver, wait).until(
                    EC.presence_of_element_located((By.ID, f"Body_repSchools_lnkSchool_{schoolNumber}")) 
                ) 

                button.click()

                allButton = WebDriverWait(driver, wait).until(
                    EC.presence_of_element_located((By.ID, f"Body_dlDepartments_lnkDept_{index}"))  
                ) #all departs button

                allButton.click()

                bigTable = WebDriverWait(driver, wait).until(
                    EC.presence_of_element_located((By.ID, "Body_oCourseList_viewSelect"))  
                )

                bigTable2 = WebDriverWait(driver, wait).until(
                    EC.presence_of_element_located((By.ID, "Body_oCourseList_tabSelect"))  
                )

                Crs = WebDriverWait(driver, wait).until(
                    EC.presence_of_all_elements_located((By.CSS_SELECTOR, ".CrsElse, .CrsOpen, .CrsClosed"))  
                )

                ResultTable = WebDriverWait(driver, wait).until(
                    EC.presence_of_all_elements_located((By.CLASS_NAME, "ResultTable"))  
                )[0]

                ResultRow2 = WebDriverWait(driver, wait).until(
                    EC.presence_of_all_elements_located((By.CSS_SELECTOR, ".ResultRow2.TypeS"))  
                )

                count = 0
                

                for rr in ResultRow2:

                    try:

                        
                        """MainTableRows = WebDriverWait(driver, wait).until(
                            EC.presence_of_all_elements_located((By.CSS_SELECTOR, ".MainTableRow.SecClosed"))  
                        )"""
                        
                        #print(MainTableRows)
            
                        tree = etree.HTML(bigTable.get_attribute('outerHTML'))
                        
                        count+=1

                        core = tree.xpath(f'//*[@id="Body_oCourseList_tabSelect"]/div[{count}]/table/tbody/tr/td[2]/table/tbody/tr/td[1]/a')
                        name = tree.xpath(f'//*[@id="Body_oCourseList_tabSelect"]/div[{count}]/table/tbody/tr/td[2]/table/tbody/tr/td[2]/a')
                        credits = tree.xpath(f'//*[@id="Body_oCourseList_tabSelect"]/div[{count}]/table/tbody/tr/td[2]/table/tbody/tr/td[3]/a')

                        dict = {}
                        dict["CourseCode"] = core[0].text
                        try:
                            dict["CourseCode"] = dict["CourseCode"].replace("\xa0"," ")
                        except Exception as e:
                            pass
                        dict["CourseName"] = name[0].text
                        dict["Credits"] = credits[0].text.split()[0]
                        

                        needs_lab = False
                        
                        try:
                            scheck = tree.xpath(f'//*[@id="Body_oCourseList_tabSelect"]/div[{count}]/table/tbody/tr/td[2]/table/tbody/tr/td[4]/a')[0].text
                            if (str(scheck).lower() == "lab required"):
                                needs_lab = True
                        except Exception as e:
                            pass

                        dict["needs_lab"] = needs_lab

                        print(dict["CourseName"],dict["needs_lab"])


                        s,d,t,b,pro = [],[],[],[],[]
                        
                        ls,ld,lt,lb,lpro = [],[],[],[],[]

                        courseNum = core[0].text.split()[0]
                        courseSpecific = core[0].text.split()[2]

                        parent = tree.xpath(f"//*[starts-with(@id, 'tr{courseNum}{courseSpecific}')]")

                        for p in parent:
                            children = p.getchildren()

                            
                            checkpoint = False;
                            if str(children[1].text).isdigit():
                                s.append(children[1].text)
                                d.append(children[2].text)
                                try:
                                    t.append(convert_to_military_time(children[3].text))
                                except Exception as e:
                                    checkpoint = True
                                    print("Time not posted yet.")
                                    s.pop()
                                    d.pop()
                            else:
                                ls.append(children[1].text)
                                ld.append(children[2].text)

                                try:
                                    lt.append(convert_to_military_time(children[3].text))
                                except Exception as e:
                                    checkpoint = True
                                    print("Time not posted yet.")
                                    ls.pop()
                                    ld.pop()
                                    # missing rfid sensors **2

                            four = "TBD"
                            five = "Unknown"

                            try:
                                four = children[4].getchildren()[0].text.strip()
                                
                            except Exception as e:
                                four = children[4].text
                            try:
                                five = str(children[5].getchildren()[0].text).split(',')[0]
                            except Exception as e:
                                try:
                                    five = str(children[5].text).split(',')[0]   
                                except Exception as e:
                                    five = children[5].text
                            

                            if str(children[1].text).isdigit():
                                if not checkpoint:
                                    pro.append(str(five))
                                    b.append(str(four))
                            else:
                                if not checkpoint:
                                    lpro.append(str(five))
                                    lb.append(str(four))

                            
                           
                            

                            
                        dict["subsection"] = s
                        dict["Days"] = d
                        dict["Times"] = t
                        dict["Building"] = b
                        dict["Prof"] = pro
                        
                        if needs_lab:
                            dict["subsection_lab"] = ls
                            dict["Days_lab"] = ld
                            dict["Times_lab"] = lt
                            dict["Building_lab"] = lb
                            dict["Prof_lab"] = lpro
                        

                        jsonList[name[0].text] = dict


                    except Exception as e:
                        print(e, "this one?")
                        continue

            except Exception as e:
                print(e, "or this one?")
                continue

    
    
    except Exception as e:
        print(e)
        pass

    except KeyboardInterrupt:
        filename = 'artsci_su25.json'
        
        dataToDumpFinal = {
            "courses": jsonList
        }
            
        with open(filename, 'w') as file:
            json.dump(dataToDumpFinal, file, indent=4)

        driver.quit()

#automate_webpage("https://courses.wustl.edu/Semester/Listing.aspx",index=1,school=8)

for i in range(0,70):
    automate_webpage("https://courses.wustl.edu/Semester/Listing.aspx",index=i,school=2)

filename = 'artsci_su25.json'

dataToDumpFinal = {
    "courses": jsonList
}
    
# Writing the list of courses to a JSON file
with open(filename, 'w') as file:
    json.dump(dataToDumpFinal, file, indent=4)