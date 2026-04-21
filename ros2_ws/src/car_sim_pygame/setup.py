import os
from glob import glob

from setuptools import find_packages, setup

package_name = 'car_sim_pygame'

setup(
    name=package_name,
    version='0.0.1',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        (os.path.join('share', package_name, 'launch'), glob('launch/*.py')),
        (os.path.join('share', package_name, 'map'), glob('map/*')),
    ],
    install_requires=['setuptools', 'numpy', 'pygame'],
    zip_safe=True,
    maintainer='Alejandro Daniel José Gómez Flórez',
    maintainer_email='aldajo92@gmail.com',
    description='2D car simulation with Pygame visualization driven by teleop',
    license='MIT',
    extras_require={
        'test': [
            'pytest',
        ],
    },
    entry_points={
        'console_scripts': [
            'car_sim_pygame_node = car_sim_pygame.car_sim_pygame_node:main',
        ],
    },
)
